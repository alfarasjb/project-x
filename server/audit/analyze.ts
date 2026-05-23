import { readFile } from "node:fs/promises"
import { posix } from "node:path"
import { z } from "zod"
import {
	NodeClassificationSchema,
	type Graph,
	type GraphNode,
	type NodeClassification
} from "@shared/schemas/graph"
import { getAdapter } from "@server/llm/fallback/factory"
import {
	ANALYZE_SYSTEM_PROMPT,
	buildAnalyzeUserPrompt,
	type AnalyzeFileInput
} from "@server/audit/analyze-prompt"

/**
 * Schema the LLM is forced into via Anthropic tool_use. Mirrors the
 * existing `description` shape minus `source` (we set that ourselves —
 * the AI never claims its output is "manual").
 */
const AnalyzeOutputSchema = z.object({
	classification: NodeClassificationSchema,
	description: z.object({
		what: z.string().min(1).max(2000),
		why: z.string().min(1).max(2000).optional()
	})
})

const ANALYZE_TOOL = {
	name: "analyze_node",
	description:
		"Report the classification (role) and a short description for the file or module just read."
}

/** Cap on simultaneous in-flight LLM calls. Anthropic tier-1 limits are forgiving at 5. */
const CONCURRENCY = 5

/**
 * Per-crawl analyze phase: walk the freshly-parsed graph, ask the LLM to
 * classify and describe every file/module that needs it, mutate the
 * returned graph nodes in place, and report how many calls were made.
 *
 * Skip rules (`shouldAnalyze`):
 *   - Skip if the node already has a manual description — the merge already
 *     preserved it, and AI never clobbers a human author.
 *   - Skip if the node has both classification + ai-source description AND
 *     its `contentHash` matches the previous crawl's hash. Re-crawl on an
 *     unchanged file ≈ 0 LLM calls.
 *   - Otherwise the node is analyzed (new file, content changed, or first
 *     crawl since classification was introduced).
 *
 * On per-node failure we log and leave the node as-is; we do NOT fail the
 * whole crawl. The next crawl will retry that node automatically.
 */
export async function analyzeGraph(
	graph: Graph,
	previous: Graph | null,
	rootPath: string
): Promise<{ graph: Graph; analyzed: number; skipped: number; failed: number }> {
	const previousByPath = previous
		? new Map(previous.nodes.map((node) => [node.path, node]))
		: new Map<string, GraphNode>()

	const toAnalyze = graph.nodes.filter((node) => {
		if (node.kind !== "file" && node.kind !== "module") return false
		return shouldAnalyze(node, previousByPath.get(node.path))
	})

	const skipped =
		graph.nodes.filter((n) => n.kind === "file" || n.kind === "module").length - toAnalyze.length
	if (toAnalyze.length === 0) {
		return { graph, analyzed: 0, skipped, failed: 0 }
	}

	const adapter = getAdapter("analyze-node")
	const childrenByParent = indexChildren(graph)

	let analyzed = 0
	let failed = 0
	let inputTokens = 0
	let outputTokens = 0
	let cacheReadTokens = 0
	let cacheCreationTokens = 0
	await runWithConcurrency(toAnalyze, CONCURRENCY, async (node) => {
		try {
			const input = await readNodeInput(node, rootPath, childrenByParent)
			if (!input) return
			const userPrompt = buildAnalyzeUserPrompt(input)
			const result = await adapter.generateStructured(
				{
					systemPrompt: ANALYZE_SYSTEM_PROMPT,
					userPrompt,
					// The same system prompt + tool definition fires on every node in
					// the crawl, so caching is a clear win — first call pays the write,
					// the rest read at 10%. Inert if the prompt is below the model's
					// cache minimum (Haiku 4.5 ⇒ 2048 tokens); harmless either way.
					cacheSystemPrompt: true
				},
				AnalyzeOutputSchema,
				ANALYZE_TOOL
			)
			applyAnalyzeResult(node, result.content)
			analyzed += 1
			inputTokens += result.usage.inputTokens
			outputTokens += result.usage.outputTokens
			cacheReadTokens += result.usage.cacheReadTokens ?? 0
			cacheCreationTokens += result.usage.cacheCreationTokens ?? 0
		} catch (error) {
			failed += 1
			const message = error instanceof Error ? error.message : String(error)
			console.warn(`[analyze] ${node.path} skipped after error: ${message}`)
		}
	})

	console.warn(
		`[analyze] tokens in=${inputTokens} out=${outputTokens} cache_read=${cacheReadTokens} cache_write=${cacheCreationTokens}`
	)

	return { graph, analyzed, skipped, failed }
}

function shouldAnalyze(node: GraphNode, previous: GraphNode | undefined): boolean {
	if (node.description?.source === "manual") return false
	const hasClassification = node.classification !== undefined
	const hasAiDescription = node.description !== undefined && node.description.source === "ai"
	if (!hasClassification || !hasAiDescription) return true
	// Module nodes don't carry a contentHash — they're cheap; analyze them when
	// any direct child changed (proxy: if the file pass writes something fresh,
	// the module that owns it gets re-analyzed too). For v1 the simpler rule
	// "re-analyze modules every crawl" is fine since module count << file count.
	if (node.kind === "module") return true
	const currentHash = node.metrics?.contentHash
	const previousHash = previous?.metrics?.contentHash
	if (!currentHash || !previousHash) return true
	return currentHash !== previousHash
}

function indexChildren(graph: Graph): Map<string, GraphNode[]> {
	const index = new Map<string, GraphNode[]>()
	for (const node of graph.nodes) {
		if (!node.parentId) continue
		const bucket = index.get(node.parentId) ?? []
		bucket.push(node)
		index.set(node.parentId, bucket)
	}
	return index
}

async function readNodeInput(
	node: GraphNode,
	rootPath: string,
	childrenByParent: Map<string, GraphNode[]>
): Promise<AnalyzeFileInput | null> {
	if (node.kind === "file") {
		const absolute = posix.join(rootPath.replace(/\\/g, "/"), node.path)
		const contents = await readFile(absolute, "utf8")
		return { path: node.path, kind: "file", contents }
	}
	if (node.kind === "module") {
		const children = childrenByParent.get(node.id) ?? []
		const childPaths = children
			.filter((child) => child.kind === "file" || child.kind === "module")
			.map((child) => child.path)
		return { path: node.path, kind: "module", contents: "", childPaths }
	}
	return null
}

function applyAnalyzeResult(
	node: GraphNode,
	output: { classification: NodeClassification; description: { what: string; why?: string } }
): void {
	node.classification = output.classification
	node.description = {
		what: output.description.what,
		source: "ai",
		...(output.description.why ? { why: output.description.why } : {})
	}
}

/**
 * Run `worker` over `items` with a fixed pool of in-flight calls. We avoid a
 * dependency (p-limit etc.) — the worker loop is ~10 lines and lets us keep
 * Project X's tight dep footprint.
 */
async function runWithConcurrency<T>(
	items: readonly T[],
	limit: number,
	worker: (item: T) => Promise<void>
): Promise<void> {
	let cursor = 0
	const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (cursor < items.length) {
			const index = cursor++
			const item = items[index]
			if (item === undefined) continue
			await worker(item)
		}
	})
	await Promise.all(runners)
}
