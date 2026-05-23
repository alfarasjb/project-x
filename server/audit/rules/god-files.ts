import type { Graph } from "@shared/schemas/graph"
import type { Issue } from "@shared/schemas/issue"

/**
 * God-file detection — files that have grown beyond a reasonable scope.
 * Multi-signal: line count OR export count. Lower thresholds are deliberately
 * generous so the feed isn't drowning in false positives on day one; tune
 * once we've seen the audit run on a few real codebases.
 *
 * Cohesion (do the exports reference each other?) is a stronger signal but
 * needs symbol-level call edges the parser doesn't emit yet — that's a
 * future enhancement.
 */
const LINE_THRESHOLD = 1000
const EXPORT_THRESHOLD = 12

export function godFiles(graph: Graph): Omit<Issue, "firstDetected">[] {
	const issues: Omit<Issue, "firstDetected">[] = []
	for (const node of graph.nodes) {
		if (node.kind !== "file") continue
		const lines = node.metrics?.lineCount ?? 0
		const exports = node.metrics?.exportCount ?? 0
		const tooLong = lines >= LINE_THRESHOLD
		const tooBroad = exports >= EXPORT_THRESHOLD
		if (!tooLong && !tooBroad) continue

		const reasons: string[] = []
		if (tooLong) reasons.push(`${lines} lines`)
		if (tooBroad) reasons.push(`${exports} exports`)

		issues.push({
			id: `god-file:${node.path}`,
			category: "god-file",
			severity: "warning",
			title: `God file: ${node.path} (${reasons.join(", ")})`,
			description:
				"This file is doing too much. Large files with many exports become " +
				"hard to reason about, slow to import, and accumulate unrelated " +
				"responsibilities. Consider splitting by concern.",
			affected: [node.path]
		})
	}
	return issues
}
