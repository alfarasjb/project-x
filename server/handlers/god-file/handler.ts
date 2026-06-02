import { readFile } from "node:fs/promises"
import { z } from "zod"
import type { Graph, GraphNode } from "@shared/schemas/graph"
import { GodFileVerdictSchema, type GodFileRefinement, type Issue } from "@shared/schemas/issue"
import { getAgentAdapter } from "@server/llm/fallback/factory"
import { AGENT_OPERATIONS } from "@server/llm/fallback/chains"
import { hashesUnchanged } from "@server/handlers/source-hashes"
import { absolutePath } from "@server/handlers/paths"
import { findSimilarToNodeTool } from "@server/tools/find-similar"
import { getNodeTool } from "@server/tools/get-node"
import { listNodesTool } from "@server/tools/list-nodes"
import type { ToolContext, ToolDefinition } from "@server/tools/types"
import {
	GOD_FILE_SYSTEM_PROMPT,
	buildGodFileUserPrompt,
	type RefineGodFileInput
} from "@server/handlers/god-file/prompt"

/**
 * God-file handler — the agent-loop second pass over the heuristic `god-file`
 * findings. Where the duplicate handler is 1-shot, this one is a multi-step
 * AgentAdapter: the model traverses the flagged file's graph neighbourhood (via
 * the shared read tools) to decide whether the line-count flag reflects a real
 * scope problem, then attaches the verdict as `issue.refinement`.
 *
 * Mirrors the duplicate-refinement handler's shape on purpose (pure per-issue
 * call + an orchestrator with skip-unchanged and per-issue try/catch) so the
 * handlers stay legible side by side. There are now four (duplicate, god-file,
 * circular-dependency, boundary-violation) and no shared `IssueHandler` interface
 * yet — extracting one is a deliberately deferred follow-up; the shared seams that
 * already exist live in `source-hashes.ts` and `paths.ts`.
 */

/**
 * Input schema for the terminal `submit_god_file_verdict` tool — what the agent
 * must produce to finish the loop. `splitPlan` is present for should-split /
 * partial, omitted for false-positive (the prompt enforces this).
 */
export const GodFileVerdictOutputSchema = z.object({
	verdict: GodFileVerdictSchema,
	reasoning: z.string().min(1).max(2000),
	splitPlan: z.string().min(1).max(2000).optional()
})
export type GodFileVerdictOutput = z.infer<typeof GodFileVerdictOutputSchema>

const SUBMIT_GOD_FILE_VERDICT = {
	name: "submit_god_file_verdict",
	description: "Submit your final verdict on whether the flagged file should be split."
} as const

/** Read-only traversal tools the agent may call. Shared with the MCP server. */
const GOD_FILE_TOOLS: readonly ToolDefinition[] = [
	getNodeTool,
	listNodesTool,
	findSimilarToNodeTool
]

/** Hard cap on agent turns. The adapter forces the verdict tool on the last turn. */
const MAX_AGENT_STEPS = 12

/**
 * Pure per-issue agent call — input god file → verdict. Wires the traversal
 * tools into the agent loop and dispatches the model's tool calls to them.
 * Mirrors `refineDuplicateCluster`/`analyzeNode`: the orchestrator below and a
 * future eval runner both funnel through here so prompt/schema can't drift.
 */
export async function refineGodFile(input: RefineGodFileInput): Promise<GodFileVerdictOutput> {
	const adapter = getAgentAdapter(AGENT_OPERATIONS.REFINE_GOD_FILE)
	const ctx: ToolContext = { projectId: input.projectId, graph: input.graph }
	const toolsByName = new Map(GOD_FILE_TOOLS.map((tool) => [tool.name, tool]))

	const result = await adapter.runAgentLoop({
		systemPrompt: GOD_FILE_SYSTEM_PROMPT,
		userPrompt: buildGodFileUserPrompt(input),
		tools: GOD_FILE_TOOLS.map((tool) => ({
			name: tool.name,
			description: tool.describe(input.projectName),
			inputSchema: tool.toJsonSchema()
		})),
		executeTool: async ({ name, input: toolInput }) => {
			const tool = toolsByName.get(name)
			if (!tool) throw new Error(`God-file agent requested unknown tool "${name}"`)
			return tool.execute(ctx, toolInput)
		},
		terminal: {
			name: SUBMIT_GOD_FILE_VERDICT.name,
			description: SUBMIT_GOD_FILE_VERDICT.description,
			schema: GodFileVerdictOutputSchema
		},
		maxSteps: MAX_AGENT_STEPS
	})
	return result.content
}

/**
 * Refine the `god-file` issues in place: for each one, read the flagged file,
 * run the agent loop, and attach the verdict as `issue.refinement`. Non-god-file
 * issues pass through untouched.
 *
 * Skip-unchanged: a god file whose `contentHash` matches the hash recorded at
 * its last refinement keeps its existing verdict — no agent run. Same contract
 * as analyze's and duplicate-refine's hash skip.
 *
 * Per-issue failures are caught and leave the issue unrefined — a bad refinement
 * never fails the analyze run.
 */
export async function refineGodFiles(args: {
	issues: Issue[]
	graph: Graph
	sourcePath: string
	projectId: string
	projectName: string
}): Promise<Issue[]> {
	const { issues, graph, sourcePath, projectId, projectName } = args
	const nodeByPath = new Map(graph.nodes.map((node) => [node.path, node]))
	let refined = 0
	let skipped = 0
	let failed = 0

	const out: Issue[] = []
	for (const issue of issues) {
		if (issue.category !== "god-file") {
			out.push(issue)
			continue
		}
		const path = issue.affected[0]
		const node = path ? nodeByPath.get(path) : undefined
		// A god-file issue points at exactly one file; bail if the node went
		// missing from the graph or isn't a file (shouldn't happen, but the
		// agent reads file contents so a non-file would have nothing to read).
		if (!node || node.kind !== "file" || issue.affected.length !== 1) {
			out.push(issue)
			continue
		}

		const currentHashes = hashesForNode(node)
		if (
			issue.refinement?.kind === "god-file" &&
			hashesUnchanged(issue.refinement.sourceHashes, currentHashes)
		) {
			skipped += 1
			out.push(issue)
			continue
		}

		try {
			const contents = await readFile(absolutePath(sourcePath, node.path), "utf8")
			const output = await refineGodFile({
				projectId,
				projectName,
				graph,
				path: node.path,
				lineCount: node.metrics?.lineCount ?? 0,
				contents,
				// Direct assignment — the prompt builder tolerates undefined, so the
				// optional fields don't need a conditional spread here.
				...(node.classification ? { classification: node.classification } : {}),
				...(node.description?.what ? { description: node.description.what } : {})
			})
			out.push({ ...issue, refinement: toRefinement(output, currentHashes) })
			refined += 1
		} catch (error) {
			failed += 1
			const message = error instanceof Error ? error.message : String(error)
			console.warn(`[refine-god-file] ${issue.id} skipped after error: ${message}`)
			out.push(issue)
		}
	}

	console.warn(`[refine-god-file] refined ${refined}, skipped ${skipped}, failed ${failed}`)
	return out
}

/** The single god file's content hash, keyed by path — the unit the skip check compares. */
function hashesForNode(node: GraphNode): Record<string, string> {
	const hash = node.metrics?.contentHash
	return hash ? { [node.path]: hash } : {}
}

function toRefinement(
	output: GodFileVerdictOutput,
	sourceHashes: Record<string, string>
): GodFileRefinement {
	return {
		kind: "god-file",
		verdict: output.verdict,
		reasoning: output.reasoning,
		...(output.splitPlan ? { splitPlan: output.splitPlan } : {}),
		sourceHashes
	}
}
