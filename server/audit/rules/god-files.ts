import type { Graph } from "@shared/schemas/graph"
import type { Issue } from "@shared/schemas/issue"

/**
 * God-file detection — files that have grown beyond a reasonable scope,
 * measured by line count alone.
 *
 * Export count was dropped as a signal: it's a language-specific proxy that
 * doesn't track "doing too much." A cohesive schema or model registry
 * legitimately exports dozens of symbols, while a 1500-line file with two
 * exports is still a god file. Lines of code is the language-agnostic measure
 * that actually correlates with scope. The threshold is deliberately generous;
 * tune as the audit runs on more real codebases.
 */
const LINE_THRESHOLD = 1000

export function godFiles(graph: Graph): Omit<Issue, "firstDetected">[] {
	const issues: Omit<Issue, "firstDetected">[] = []
	for (const node of graph.nodes) {
		if (node.kind !== "file") continue
		const lines = node.metrics?.lineCount ?? 0
		if (lines < LINE_THRESHOLD) continue

		issues.push({
			id: `god-file:${node.path}`,
			category: "god-file",
			severity: "warning",
			title: `God file: ${node.path} (${lines} lines)`,
			description:
				"This file is doing too much. Large files are hard to reason about, " +
				"slow to import, and accumulate unrelated responsibilities. Consider " +
				"splitting by concern.",
			affected: [node.path]
		})
	}
	return issues
}
