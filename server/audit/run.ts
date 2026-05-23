import type { Graph } from "@shared/schemas/graph"
import type { Issue } from "@shared/schemas/issue"
import { aiReview } from "@server/audit/rules/ai-review"
import { circularDependencies } from "@server/audit/rules/circular-dependencies"
import { godFiles } from "@server/audit/rules/god-files"
import { bidirectionalDependencies } from "@server/audit/rules/bidirectional-deps"

/**
 * Audit orchestrator — runs every heuristic rule over the classified graph
 * and returns the flat list of `Issue` findings. Pure: same input → same
 * output, no side effects, no DB access. Called at the end of `crawlProject`;
 * `firstDetected` preservation across crawls is the caller's job.
 *
 * To add a rule: write `(graph) => Issue[]` and append it here. Keep rules
 * cheap (the audit runs synchronously inside the crawl response).
 */
export function runAudit(graph: Graph): Issue[] {
	const now = new Date().toISOString()
	const rules: readonly ((graph: Graph) => Omit<Issue, "firstDetected">[])[] = [
		circularDependencies,
		godFiles,
		bidirectionalDependencies,
		aiReview
	]
	return rules.flatMap((rule) => rule(graph).map((issue) => ({ ...issue, firstDetected: now })))
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
