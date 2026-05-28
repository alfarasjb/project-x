import { readFile } from "node:fs/promises"
import { posix } from "node:path"
import { z } from "zod"
import type { Graph, GraphNode } from "@shared/schemas/graph"
import { RefinementVerdictSchema, type Issue, type IssueRefinement } from "@shared/schemas/issue"
import { getAdapter } from "@server/llm/fallback/factory"
import {
	REFINE_DUPLICATE_SYSTEM_PROMPT,
	buildRefineDuplicateUserPrompt,
	type RefineDuplicateClusterInput
} from "@server/handlers/duplicate-refinement/prompt"

/**
 * Duplicate-refinement handler — the second-pass LLM judge over the
 * `duplicate-candidates` clusters the audit rule emits.
 *
 * 1-shot (no agent loop): read the cluster's files, ask Claude whether they
 * genuinely duplicate, attach the verdict as `issue.refinement`. The audit
 * rule is recall-tuned; this handler is precision — it can veto a whole
 * cluster (`false-positive`) or split proximity-only members out (`excluded`).
 */

/**
 * Output schema sent to Claude as the `refine_duplicate_cluster` tool's
 * input_schema. `excluded` defaults to [] on parse (same reason analyze
 * defaults `concerns`: the model sometimes omits an empty field).
 */
export const RefineDuplicateOutputSchema = z.object({
	verdict: RefinementVerdictSchema,
	reasoning: z.string().min(1).max(2000),
	consolidation: z.string().min(1).max(2000).optional(),
	excluded: z.array(z.string().min(1)).default([])
})
export type RefineDuplicateOutput = z.infer<typeof RefineDuplicateOutputSchema>

const REFINE_DUPLICATE_TOOL = {
	name: "refine_duplicate_cluster",
	description:
		"Report whether the flagged files genuinely duplicate, and split out any proximity-only members."
}

/**
 * Pure 1-shot LLM call — input cluster → verdict. No FS, no graph mutation.
 * Mirrors `analyzeNode`: the orchestrator below and a future eval runner both
 * funnel through here so the prompt/schema can't drift.
 */
export async function refineDuplicateCluster(
	input: RefineDuplicateClusterInput
): Promise<RefineDuplicateOutput> {
	const adapter = getAdapter("refine-duplicate-cluster")
	const userPrompt = buildRefineDuplicateUserPrompt(input)
	const result = await adapter.generateStructured(
		{ systemPrompt: REFINE_DUPLICATE_SYSTEM_PROMPT, userPrompt },
		RefineDuplicateOutputSchema,
		REFINE_DUPLICATE_TOOL
	)
	return result.content
}

/** Only clusters at or under this size are refined — bounds prompt token cost. */
const MAX_CLUSTER_TO_REFINE = 6

/**
 * Refine the `duplicate-candidates` issues in place: for each qualifying
 * cluster, read its files, ask Claude whether they genuinely duplicate, and
 * attach the verdict as `issue.refinement`. Non-duplicate issues and clusters
 * that don't qualify pass through untouched.
 *
 * Qualification (v1): every member is a `file` (module clusters need multi-file
 * reading — that's an agent-loop handler's job) and the cluster is small enough
 * to fit the prompt budget.
 *
 * Skip-unchanged: a cluster whose members all carry the same `contentHash` they
 * had at the last refinement (recorded in `refinement.sourceHashes`) keeps its
 * existing verdict — no LLM call. Same contract as analyze's hash skip.
 *
 * Per-cluster failures are caught and leave the issue unrefined — a bad
 * refinement never fails the analyze run.
 */
export async function refineDuplicateClusters(
	issues: Issue[],
	graph: Graph,
	sourcePath: string
): Promise<Issue[]> {
	const nodeByPath = new Map(graph.nodes.map((node) => [node.path, node]))
	let refined = 0
	let skipped = 0
	let failed = 0

	const out: Issue[] = []
	for (const issue of issues) {
		if (issue.category !== "duplicate-candidates") {
			out.push(issue)
			continue
		}
		const members = issue.affected
			.map((path) => nodeByPath.get(path))
			.filter((node): node is GraphNode => node !== undefined)
		if (!qualifies(members, issue.affected.length)) {
			out.push(issue)
			continue
		}

		const currentHashes = hashesByPath(members)
		if (issue.refinement && hashesUnchanged(issue.refinement.sourceHashes, currentHashes)) {
			skipped += 1
			out.push(issue)
			continue
		}

		try {
			const files = await Promise.all(
				members.map(async (node) => ({
					path: node.path,
					// Direct assignment — the prompt builder tolerates undefined (it
					// drops falsy meta lines), so optional fields don't need a spread.
					classification: node.classification,
					description: node.description?.what,
					contents: await readFile(absolutePath(sourcePath, node.path), "utf8")
				}))
			)
			const output = await refineDuplicateCluster({ files })
			out.push({ ...issue, refinement: toRefinement(output, currentHashes) })
			refined += 1
		} catch (error) {
			failed += 1
			const message = error instanceof Error ? error.message : String(error)
			console.warn(`[refine-duplicate] ${issue.id} skipped after error: ${message}`)
			out.push(issue)
		}
	}

	console.warn(`[refine-duplicate] refined ${refined}, skipped ${skipped}, failed ${failed}`)
	return out
}

function qualifies(members: readonly GraphNode[], affectedCount: number): boolean {
	// Drop clusters where a member node went missing from the graph, or that
	// mix in a non-file, or that are too big to fit the prompt budget.
	if (members.length !== affectedCount) return false
	if (members.length < 2 || members.length > MAX_CLUSTER_TO_REFINE) return false
	return members.every((node) => node.kind === "file")
}

function hashesByPath(members: readonly GraphNode[]): Record<string, string> {
	const hashes: Record<string, string> = {}
	for (const node of members) {
		const hash = node.metrics?.contentHash
		if (hash) hashes[node.path] = hash
	}
	return hashes
}

function hashesUnchanged(prev: Record<string, string>, current: Record<string, string>): boolean {
	const prevKeys = Object.keys(prev)
	const currentKeys = Object.keys(current)
	// A member without a contentHash means we can't prove it's unchanged — refine.
	if (prevKeys.length === 0 || prevKeys.length !== currentKeys.length) return false
	return currentKeys.every((key) => prev[key] === current[key])
}

function toRefinement(
	output: RefineDuplicateOutput,
	sourceHashes: Record<string, string>
): IssueRefinement {
	return {
		verdict: output.verdict,
		reasoning: output.reasoning,
		...(output.consolidation ? { consolidation: output.consolidation } : {}),
		...(output.excluded.length > 0 ? { excluded: output.excluded } : {}),
		sourceHashes
	}
}

function absolutePath(sourcePath: string, nodePath: string): string {
	return posix.join(sourcePath.replace(/\\/g, "/"), nodePath)
}
