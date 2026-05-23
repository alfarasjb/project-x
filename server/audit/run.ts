import type { Graph } from "@shared/schemas/graph"
import type { Issue } from "@shared/schemas/issue"
import { computeBlastRadii } from "@server/audit/blast-radius"
import { aiReview } from "@server/audit/rules/ai-review"
import { boundaryViolations } from "@server/audit/rules/boundary-violations"
import { circularDependencies } from "@server/audit/rules/circular-dependencies"
import { godFiles } from "@server/audit/rules/god-files"
import { bidirectionalDependencies } from "@server/audit/rules/bidirectional-deps"

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
 */
export function runAudit(graph: Graph): Issue[] {
	const now = new Date().toISOString()
	const rules: readonly ((graph: Graph) => Omit<Issue, "firstDetected">[])[] = [
		circularDependencies,
		godFiles,
		bidirectionalDependencies,
		boundaryViolations,
		aiReview
	]
	const blastRadii = computeBlastRadii(graph)
	const idByPath = new Map(graph.nodes.map((node) => [node.path, node.id]))
	return rules.flatMap((rule) =>
		rule(graph).map((issue) => {
			// First affected entry is the "primary" target — for per-file rules
			// (god-file, ai-review, boundary-violation) it's the file itself; for
			// circular/bidirectional rules it's one of the cycle members. Good
			// enough as a single number to display on the card.
			const primaryPath = issue.affected[0]
			const primaryId = primaryPath ? idByPath.get(primaryPath) : undefined
			const blastRadius = primaryId ? blastRadii.get(primaryId) : undefined
			return {
				...issue,
				firstDetected: now,
				...(blastRadius ? { blastRadius } : {})
			}
		})
	)
}

/**
 * Preserve `firstDetected` across crawls — for any new issue whose `id`
 * matches one from the previous run, carry forward the earlier timestamp
 * so "issue introduced 3 crawls ago" survives. New issues keep their
 * fresh stamp from `runAudit`.
 */
export function mergeIssueHistory(fresh: Issue[], previous: Issue[]): Issue[] {
	const previousById = new Map(previous.map((issue) => [issue.id, issue]))
	return fresh.map((issue) => {
		const prior = previousById.get(issue.id)
		return prior ? { ...issue, firstDetected: prior.firstDetected } : issue
	})
}
