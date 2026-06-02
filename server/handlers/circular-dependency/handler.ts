import { readFile } from "node:fs/promises"
import { z } from "zod"
import type { Graph, GraphNode } from "@shared/schemas/graph"
import {
	CircularDependencyVerdictSchema,
	type CircularDependencyRefinement,
	type Issue
} from "@shared/schemas/issue"
import { getAdapter } from "@server/llm/fallback/factory"
import { LLM_OPERATIONS } from "@server/llm/fallback/chains"
import { hashesByPath, hashesUnchanged } from "@server/handlers/source-hashes"
import { absolutePath } from "@server/handlers/paths"
import {
	REFINE_CIRCULAR_SYSTEM_PROMPT,
	buildRefineCircularUserPrompt,
	type RefineCircularDependencyInput
} from "@server/handlers/circular-dependency/prompt"

/**
 * Circular-dependency handler — the second-pass LLM judge over the heuristic
 * `circular-dependency` findings the audit rule emits.
 *
 * 1-shot (no agent loop), mirroring the duplicate-refinement handler: a cycle's
 * evidence is fully contained in its members, so we read the cycle's files and
 * ask Claude in a single call whether the cycle is worth breaking. The DFS rule
 * is recall-tuned (it flags every cycle); this handler is precision — it can
 * mark a cycle `acceptable` (type/test-only) or `false-positive` (parser artifact).
 *
 * Mirrors the duplicate/god-file handlers' shape on purpose (a pure per-issue
 * call + an orchestrator with skip-unchanged and per-issue try/catch) so the
 * handlers stay legible side by side.
 */

/**
 * Output schema sent to Claude as the `refine_circular_dependency` tool's
 * input_schema. `resolution` is omitted for false-positive (the prompt enforces this).
 */
export const RefineCircularOutputSchema = z.object({
	verdict: CircularDependencyVerdictSchema,
	reasoning: z.string().min(1).max(2000),
	resolution: z.string().min(1).max(2000).optional()
})
export type RefineCircularOutput = z.infer<typeof RefineCircularOutputSchema>

const REFINE_CIRCULAR_TOOL = {
	name: "refine_circular_dependency",
	description: "Report whether the import cycle is worth breaking, tolerable, or a false positive."
}

/**
 * Pure 1-shot LLM call — input cycle → verdict. No FS, no graph mutation.
 * Mirrors `refineDuplicateCluster`: the orchestrator below and a future eval
 * runner both funnel through here so the prompt/schema can't drift.
 */
export async function refineCircularDependency(
	input: RefineCircularDependencyInput
): Promise<RefineCircularOutput> {
	const adapter = getAdapter(LLM_OPERATIONS.REFINE_CIRCULAR_DEPENDENCY)
	const userPrompt = buildRefineCircularUserPrompt(input)
	const result = await adapter.generateStructured(
		{ systemPrompt: REFINE_CIRCULAR_SYSTEM_PROMPT, userPrompt },
		RefineCircularOutputSchema,
		REFINE_CIRCULAR_TOOL
	)
	return result.content
}

/** Only cycles at or under this length are refined — bounds prompt token cost. */
const MAX_CYCLE_TO_REFINE = 8

/**
 * Refine the `circular-dependency` issues in place: for each qualifying cycle,
 * read its files in cycle order, ask Claude whether it's worth breaking, and
 * attach the verdict as `issue.refinement`. Other issues and cycles that don't
 * qualify pass through untouched.
 *
 * Qualification (v1): every cycle member is still a `file` in the graph and the
 * cycle is short enough to fit the prompt budget.
 *
 * Skip-unchanged: a cycle whose members all carry the same `contentHash` they
 * had at the last refinement keeps its existing verdict — no LLM call. Same
 * contract as analyze's and the other handlers' hash skip.
 *
 * Per-cycle failures are caught and leave the issue unrefined — a bad
 * refinement never fails the analyze run.
 */
export async function refineCircularDependencies(
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
		if (issue.category !== "circular-dependency") {
			out.push(issue)
			continue
		}
		// Preserve cycle order — the prompt renders the import arrow from it.
		const members = issue.affected
			.map((path) => nodeByPath.get(path))
			.filter((node): node is GraphNode => node !== undefined)
		// A cycle member vanished from the graph or isn't a file — the rule emits
		// file paths, so this is real upstream drift worth surfacing, not a quiet skip.
		if (members.length !== issue.affected.length || members.some((node) => node.kind !== "file")) {
			console.warn(`[refine-circular] ${issue.id} skipped — cycle member missing or not a file`)
			out.push(issue)
			continue
		}
		// Too long for the prompt budget — an intentional cap, so skip quietly.
		if (members.length < 2 || members.length > MAX_CYCLE_TO_REFINE) {
			out.push(issue)
			continue
		}

		const currentHashes = hashesByPath(members)
		if (
			issue.refinement?.kind === "circular-dependency" &&
			hashesUnchanged(issue.refinement.sourceHashes, currentHashes)
		) {
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
			const output = await refineCircularDependency({ files })
			out.push({ ...issue, refinement: toRefinement(output, currentHashes) })
			refined += 1
		} catch (error) {
			failed += 1
			const message = error instanceof Error ? error.message : String(error)
			console.warn(`[refine-circular] ${issue.id} skipped after error: ${message}`)
			out.push(issue)
		}
	}

	console.warn(`[refine-circular] refined ${refined}, skipped ${skipped}, failed ${failed}`)
	return out
}

function toRefinement(
	output: RefineCircularOutput,
	sourceHashes: Record<string, string>
): CircularDependencyRefinement {
	return {
		kind: "circular-dependency",
		verdict: output.verdict,
		reasoning: output.reasoning,
		...(output.resolution ? { resolution: output.resolution } : {}),
		sourceHashes
	}
}
