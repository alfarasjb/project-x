import { readFile } from "node:fs/promises"
import { posix } from "node:path"
import { z } from "zod"
import {
	ConcernSchema,
	NodeClassificationSchema,
	type Concern,
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
/**
 * Output schema sent to Claude as the `analyze_node` tool's input_schema.
 *
 * Deliberately FLAT — nested objects (`description: { what, why }`) cause
 * intermittent format drift where the model emits XML-tool-call leakage
 * (`<parameter name="what">`) inside a stringified description. Flat
 * top-level properties round-trip cleanly. We re-assemble the nested
 * `Description` server-side in `applyAnalyzeResult`.
 *
 * `concerns` defaults to `[]` on parse: Claude usually returns the field
 * explicitly, but on clean files it sometimes interprets "empty if clean"
 * as "omit if clean" and drops it. Defaulting prevents that drift from
 * burning a retry without weakening the prompt's intent.
 */
const AnalyzeOutputSchema = z.object({
	classification: NodeClassificationSchema,
	summary: z.string().min(1).max(2000),
	rationale: z.string().min(1).max(2000).optional(),
	concerns: z.array(ConcernSchema).max(5).default([])
})

const ANALYZE_TOOL = {
	name: "analyze_node",
	description:
		"Report the classification (role) and a short description for the file or module just read."
}

/**
 * Cap on simultaneous in-flight LLM calls. Anthropic tier-2+ handles this
 * comfortably (a 423-node run sustained ~120 RPM without throttling); the
 * BaseAdapter retries with backoff if a 429 lands.
 */
const CONCURRENCY = 10

/**
 * Per-crawl analyze phase: walk the freshly-parsed graph, ask the LLM to
 * classify and describe every file/module that needs it, mutate the
 * returned graph nodes in place, and report how many calls were made.
 *
 * Skip rules (`shouldAnalyze`) — all self-contained per node, no previous
 * graph needed:
 *   - Skip if the node already has a manual description — the merge
 *     preserved it, and AI never clobbers a human author.
 *   - Skip if the node has classification + ai-source description AND its
 *     current `metrics.contentHash` matches its stored `analyzedHash` (the
 *     hash we last analyzed it at). Re-analyze on an unchanged file = 0
 *     LLM calls.
 *   - Otherwise analyze (new file, content changed since last analyze, or
 *     first analyze ever).
 *
 * On per-node failure we log and leave the node as-is; we do NOT fail the
 * whole crawl. The next analyze run retries any unclassified nodes
 * automatically.
 */
export async function analyzeGraph(
	graph: Graph,
	rootPath: string,
	options?: { force?: boolean }
): Promise<{ graph: Graph; analyzed: number; skipped: number; failed: number }> {
	const force = options?.force ?? false
	const toAnalyze = graph.nodes.filter((node) => {
		if (node.kind !== "file" && node.kind !== "module") return false
		return shouldAnalyze(node, force)
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
	await runWithConcurrency(toAnalyze, CONCURRENCY, async (node) => {
		try {
			const input = await readNodeInput(node, rootPath, childrenByParent)
			if (!input) return
			const userPrompt = buildAnalyzeUserPrompt(input)
			const result = await adapter.generateStructured(
				{ systemPrompt: ANALYZE_SYSTEM_PROMPT, userPrompt },
				AnalyzeOutputSchema,
				ANALYZE_TOOL
			)
			applyAnalyzeResult(node, result.content)
			analyzed += 1
			inputTokens += result.usage.inputTokens
			outputTokens += result.usage.outputTokens
		} catch (error) {
			failed += 1
			const message = error instanceof Error ? error.message : String(error)
			console.warn(`[analyze] ${node.path} skipped after error: ${message}`)
		}
	})

	console.warn(`[analyze] tokens in=${inputTokens} out=${outputTokens}`)

	return { graph, analyzed, skipped, failed }
}

function shouldAnalyze(node: GraphNode, force: boolean): boolean {
	// Manual descriptions are user-authored and AI never clobbers them, even
	// in force mode — that override is intentional and shouldn't be undone by
	// "re-analyze everything."
	if (node.description?.source === "manual") return false
	if (force) return true
	const hasClassification = node.classification !== undefined
	const hasAiDescription = node.description !== undefined && node.description.source === "ai"
	if (!hasClassification || !hasAiDescription) return true
	// Files hash their content; modules hash their sorted child paths (parser
	// emits both). The skip rule is identical for both: current hash matches
	// the hash we last analyzed at → skip.
	const currentHash = node.metrics?.contentHash
	if (!currentHash || !node.analyzedHash) return true
	return currentHash !== node.analyzedHash
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
	output: {
		classification: NodeClassification
		summary: string
		rationale?: string
		concerns: Concern[]
	}
): void {
	node.classification = output.classification
	// Re-assemble the nested Description from the flat tool-call output.
	node.description = {
		what: output.summary,
		source: "ai",
		...(output.rationale ? { why: output.rationale } : {})
	}
	// Always write `concerns` — even when empty — so a previously-flagged
	// file that's been cleaned up loses its concerns on re-analyze.
	node.concerns = output.concerns
	// Stamp the hash we analyzed at — this is what `shouldAnalyze` reads next
	// run to skip unchanged nodes. Both files (content hash) and modules
	// (sorted-child-paths hash) carry one; the rare node without metrics
	// (top-level "src", legacy crawls) stays unmarked and re-analyzes once.
	if (node.metrics?.contentHash) {
		node.analyzedHash = node.metrics.contentHash
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
