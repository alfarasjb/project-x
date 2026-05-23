import type { Graph } from "@shared/schemas/graph"
import type { Issue, IssueSeverity } from "@shared/schemas/issue"

/**
 * AI Review rule — turns the per-node `concerns` written by the analyze
 * pass into Issue Feed entries. One issue per file that has at least one
 * concern.
 *
 * The issue carries the concerns both ways: as `concerns` (structured,
 * for the UI to render as tagged items) and as `description` (the same
 * content as a fallback plain-text string for clients that ignore the
 * structured field — currently just the eventual MCP exposure).
 *
 * Severity is **count-based and deterministic** on purpose: Claude only
 * enumerates concerns, never assigns priority. We decide what "shit file"
 * looks like by counting how much the AI flagged. If we later want
 * category-weighted severity (some categories always > info regardless of
 * count), it changes here — no re-analyze needed.
 */
export function aiReview(graph: Graph): Omit<Issue, "firstDetected">[] {
	const issues: Omit<Issue, "firstDetected">[] = []
	for (const node of graph.nodes) {
		const concerns = node.concerns
		if (!concerns || concerns.length === 0) continue
		issues.push({
			id: `ai-review:${node.path}`,
			category: "ai-review",
			severity: severityFromCount(concerns.length),
			title: `${node.path} — ${concerns.length} concern${concerns.length === 1 ? "" : "s"}`,
			description: concerns.map((c) => `[${c.category}] ${c.message}`).join("\n"),
			affected: [node.path],
			concerns: [...concerns]
		})
	}
	return issues
}

function severityFromCount(count: number): IssueSeverity {
	if (count >= 3) return "critical"
	if (count === 2) return "warning"
	return "info"
}
