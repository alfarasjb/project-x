import { readFile } from "node:fs/promises"
import { posix } from "node:path"
import { z } from "zod"
import type { Graph, GraphNode } from "@shared/schemas/graph"
import {
	BoundaryViolationVerdictSchema,
	type BoundaryViolationRefinement,
	type Issue
} from "@shared/schemas/issue"
import { getAgentAdapter } from "@server/llm/fallback/factory"
import { hashesUnchanged } from "@server/handlers/source-hashes"
import { findSimilarToNodeTool } from "@server/tools/find-similar"
import { getNodeTool } from "@server/tools/get-node"
import { listNodesTool } from "@server/tools/list-nodes"
import type { ToolContext, ToolDefinition } from "@server/tools/types"
import {
	BOUNDARY_SYSTEM_PROMPT,
	buildBoundaryUserPrompt,
	type RefineBoundaryViolationInput
} from "@server/handlers/boundary-violation/prompt"

/**
 * Boundary-violation handler — the agent-loop second pass over the heuristic
 * `boundary-violation` findings. Like the god-file handler (and unlike the 1-shot
 * duplicate/circular handlers), the verdict depends on graph context the two
 * files alone don't show, so the model traverses the flagged source file's
 * neighbourhood via the shared read tools before judging whether a cross-layer
 * import is a real breach, a justified exception, or a misclassification.
 *
 * Mirrors the god-file handler's shape on purpose (a pure per-issue agent call +
 * an orchestrator with skip-unchanged and per-issue try/catch) so the handlers
 * stay legible side by side.
 */

/**
 * Input schema for the terminal `submit_boundary_verdict` tool — what the agent
 * must produce to finish the loop. `remediation` is present for "violation",
 * omitted otherwise (the prompt enforces this).
 */
export const BoundaryVerdictOutputSchema = z.object({
	verdict: BoundaryViolationVerdictSchema,
	reasoning: z.string().min(1).max(2000),
	remediation: z.string().min(1).max(2000).optional()
})
export type BoundaryVerdictOutput = z.infer<typeof BoundaryVerdictOutputSchema>

const SUBMIT_BOUNDARY_VERDICT = {
	name: "submit_boundary_verdict",
	description: "Submit your final verdict on whether the flagged import is a boundary violation."
} as const

/** Read-only traversal tools the agent may call. Shared with the MCP server. */
const BOUNDARY_TOOLS: readonly ToolDefinition[] = [
	getNodeTool,
	listNodesTool,
	findSimilarToNodeTool
]

/** Hard cap on agent turns. The adapter forces the verdict tool on the last turn. */
const MAX_AGENT_STEPS = 12

/**
 * Pure per-issue agent call — input boundary violation → verdict. Wires the
 * traversal tools into the agent loop and dispatches the model's tool calls to
 * them. Mirrors `refineGodFile`: the orchestrator below and a future eval runner
 * both funnel through here so prompt/schema can't drift.
 */
export async function refineBoundaryViolation(
	input: RefineBoundaryViolationInput
): Promise<BoundaryVerdictOutput> {
	const adapter = getAgentAdapter("refine-boundary-violation")
	const ctx: ToolContext = { projectId: input.projectId, graph: input.graph }
	const toolsByName = new Map(BOUNDARY_TOOLS.map((tool) => [tool.name, tool]))

	const result = await adapter.runAgentLoop({
		systemPrompt: BOUNDARY_SYSTEM_PROMPT,
		userPrompt: buildBoundaryUserPrompt(input),
		tools: BOUNDARY_TOOLS.map((tool) => ({
			name: tool.name,
			description: tool.describe(input.projectName),
			inputSchema: tool.toJsonSchema()
		})),
		executeTool: async ({ name, input: toolInput }) => {
			const tool = toolsByName.get(name)
			if (!tool) throw new Error(`Boundary agent requested unknown tool "${name}"`)
			return tool.execute(ctx, toolInput)
		},
		terminal: {
			name: SUBMIT_BOUNDARY_VERDICT.name,
			description: SUBMIT_BOUNDARY_VERDICT.description,
			schema: BoundaryVerdictOutputSchema
		},
		maxSteps: MAX_AGENT_STEPS
	})
	return result.content
}

/**
 * Refine the `boundary-violation` issues in place: for each one, read the flagged
 * source file, run the agent loop, and attach the verdict as `issue.refinement`.
 * Non-boundary issues pass through untouched.
 *
 * A boundary issue's `affected` is `[sourcePath, ...targetPaths]` — the source is
 * the importer the agent reads up front; the targets are the edges it inspects
 * through the graph.
 *
 * Skip-unchanged: a violation whose source + target files all carry the same
 * `contentHash` they had at the last refinement keeps its existing verdict — no
 * agent run. Same contract as analyze's and the other handlers' hash skip.
 *
 * Per-issue failures are caught and leave the issue unrefined — a bad refinement
 * never fails the analyze run.
 */
export async function refineBoundaryViolations(args: {
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
		if (issue.category !== "boundary-violation") {
			out.push(issue)
			continue
		}
		// `affected[0]` is the importing source file; the rest are the targets it
		// shouldn't import. The agent reads the source's contents, so bail if the
		// source node went missing from the graph or isn't a file.
		const sourceNodePath = issue.affected[0]
		const source = sourceNodePath ? nodeByPath.get(sourceNodePath) : undefined
		if (!source || source.kind !== "file" || issue.affected.length < 2) {
			out.push(issue)
			continue
		}

		// Hash every member that's still present (source + targets) so an edit to
		// either side of the edge re-triggers the judgment.
		const members = issue.affected
			.map((path) => nodeByPath.get(path))
			.filter((node): node is GraphNode => node !== undefined)
		const currentHashes = hashesByPath(members)
		if (
			issue.refinement?.kind === "boundary-violation" &&
			hashesUnchanged(issue.refinement.sourceHashes, currentHashes)
		) {
			skipped += 1
			out.push(issue)
			continue
		}

		try {
			const contents = await readFile(absolutePath(sourcePath, source.path), "utf8")
			const output = await refineBoundaryViolation({
				projectId,
				projectName,
				graph,
				path: source.path,
				contents,
				targets: issue.affected.slice(1),
				violationDetail: issue.description,
				// Direct assignment — the prompt builder tolerates undefined, so the
				// optional fields don't need a conditional spread here.
				...(source.classification ? { classification: source.classification } : {}),
				...(source.description?.what ? { description: source.description.what } : {})
			})
			out.push({ ...issue, refinement: toRefinement(output, currentHashes) })
			refined += 1
		} catch (error) {
			failed += 1
			const message = error instanceof Error ? error.message : String(error)
			console.warn(`[refine-boundary] ${issue.id} skipped after error: ${message}`)
			out.push(issue)
		}
	}

	console.warn(`[refine-boundary] refined ${refined}, skipped ${skipped}, failed ${failed}`)
	return out
}

function hashesByPath(members: readonly GraphNode[]): Record<string, string> {
	const hashes: Record<string, string> = {}
	for (const node of members) {
		const hash = node.metrics?.contentHash
		if (hash) hashes[node.path] = hash
	}
	return hashes
}

function toRefinement(
	output: BoundaryVerdictOutput,
	sourceHashes: Record<string, string>
): BoundaryViolationRefinement {
	return {
		kind: "boundary-violation",
		verdict: output.verdict,
		reasoning: output.reasoning,
		...(output.remediation ? { remediation: output.remediation } : {}),
		sourceHashes
	}
}

function absolutePath(sourcePath: string, nodePath: string): string {
	return posix.join(sourcePath.replace(/\\/g, "/"), nodePath)
}
