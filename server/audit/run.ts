import type { Graph } from "@shared/schemas/graph"
import type { Issue } from "@shared/schemas/issue"
import { computeBlastRadii } from "@server/audit/blast-radius"
import { aiReview } from "@server/audit/rules/ai-review"
import { boundaryViolations } from "@server/audit/rules/boundary-violations"
import { circularDependencies } from "@server/audit/rules/circular-dependencies"
import { godFiles } from "@server/audit/rules/god-files"
import { bidirectionalDependencies } from "@server/audit/rules/bidirectional-deps"
import { duplicateCandidates } from "@server/audit/rules/duplicate-candidates"

/**
 * Audit orchestrator — runs every heuristic rule over the classified graph
 * and returns the flat list of `Issue` findings, each enriched with the
 * blast radius of its primary affected node. Pure: same input → same
 * output, no side effects, no DB access. Called at the end of `crawlProject`;
 * `firstDetected` preservation across crawls is the caller's job.
 *
 * To add a rule: write `(graph) => Issue[]` and append it here. Keep rules
 * cheap (the audit runs synchronously inside the crawl response).
 *
 * Blast radius runs once per audit and is reused across issues. It's not a
 * rule (doesn't emit cards on its own) — it's a metadata pass that lets
 * cards show their reach ("47 dependents") so a god file affecting half
 * the codebase visibly outranks one affecting nothing.
 *
 * Async / DB-backed rules (e.g. `duplicate-candidates`, which queries
 * pgvector) deliberately do NOT live here — they break the pure/sync
 * contract. Run them via `runSimilarityAudit` after `embedNodes` and
 * concatenate the results before `mergeIssueHistory`.
 */
export function runAudit(graph: Graph): Issue[] {
	const rules: readonly ((graph: Graph) => Omit<Issue, "firstDetected">[])[] = [
		circularDependencies,
		godFiles,
		bidirectionalDependencies,
		boundaryViolations,
		aiReview
	]
	const rawIssues = rules.flatMap((rule) => rule(graph))
	return enrichIssues(rawIssues, graph)
}

/**
 * Async, DB-backed audit pass — currently just the duplicate-candidates
 * rule, which needs the pgvector index to find similar peers. MUST run
 * after `embedNodes` so the vectors it queries are fresh; runs cleanly
 * with no embeddings (each `findSimilarNodes` call returns `[]` for
 * un-embedded nodes), emitting zero issues.
 *
 * Kept separate from `runAudit` to preserve that runner's pure/sync
 * contract — the existing heuristic rules don't need a Promise or a DB
 * handle, and shouldn't pay the cost of one.
 */
export async function runSimilarityAudit(projectId: string, graph: Graph): Promise<Issue[]> {
	const rawIssues = await duplicateCandidates(projectId, graph)
	return enrichIssues(rawIssues, graph)
}

/**
 * Stamp raw rule output with `firstDetected` and an optional `blastRadius`.
 * Both rule paths (sync heuristic + async similarity) go through this so
 * UI cards render consistently regardless of which rule produced them.
 *
 * `blastRadius` is computed from the FIRST entry in `affected`; per-file
 * rules put the affected file there, cycle rules put one of the cycle
 * members. Issues with multiple equally-affected nodes (duplicate-candidates
 * is one — two files, neither is "primary") still get a blast number from
 * the first entry. Acceptable for now; revisit if dual-blast displays
 * become useful.
 */
function enrichIssues(rawIssues: readonly Omit<Issue, "firstDetected">[], graph: Graph): Issue[] {
	const now = new Date().toISOString()
	const blastRadii = computeBlastRadii(graph)
	const idByPath = new Map(graph.nodes.map((node) => [node.path, node.id]))
	return rawIssues.map((issue) => {
		const primaryPath = issue.affected[0]
		const primaryId = primaryPath ? idByPath.get(primaryPath) : undefined
		const blastRadius = primaryId ? blastRadii.get(primaryId) : undefined
		return {
			...issue,
			firstDetected: now,
			...(blastRadius ? { blastRadius } : {})
		}
	})
}

/**
 * Preserve cross-crawl state — for any fresh issue whose `id` matches one from
 * the previous run, carry forward:
 *   - `firstDetected` — so "issue introduced 3 crawls ago" survives.
 *   - `refinement` — the LLM verdict from a handler (e.g. duplicate-refinement).
 *     A fresh audit issue has none; the same id means it's the same finding, so
 *     we keep the prior verdict. The handler's own skip-unchanged logic
 *     (sourceHashes) then decides whether to re-run or keep it.
 *
 * New issues keep their fresh stamp from `runAudit` and have no refinement.
 */
export function mergeIssueHistory(fresh: Issue[], previous: Issue[]): Issue[] {
	const previousById = new Map(previous.map((issue) => [issue.id, issue]))
	return fresh.map((issue) => {
		const prior = previousById.get(issue.id)
		if (!prior) return issue
		return {
			...issue,
			firstDetected: prior.firstDetected,
			...(prior.refinement !== undefined ? { refinement: prior.refinement } : {})
		}
	})
}
