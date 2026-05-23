import type { Graph } from "@shared/schemas/graph"
import type { Issue } from "@shared/schemas/issue"

/**
 * Bidirectional-dependency detection — file A imports B and B imports A
 * (a 2-node cycle, but flagged separately from full circular-dep detection
 * because the smell is slightly different: two modules that ought to be
 * cleanly separated have leaked across the boundary).
 *
 * Skipped if either file is also part of a longer circular chain — the
 * circular-dependency rule already covers it and a second issue would just
 * be noise. The check stays cheap by only scanning pair-wise edges.
 */
export function bidirectionalDependencies(graph: Graph): Omit<Issue, "firstDetected">[] {
	const fileIds = new Set(graph.nodes.filter((node) => node.kind === "file").map((node) => node.id))
	const labelOf = new Map(graph.nodes.map((node) => [node.id, node.path]))

	// Build a quick set of "A→B" edges so we can probe the reverse.
	const directed = new Set<string>()
	for (const edge of graph.edges) {
		if (edge.kind !== "dependency") continue
		if (!fileIds.has(edge.source) || !fileIds.has(edge.target)) continue
		directed.add(`${edge.source}|${edge.target}`)
	}

	const seen = new Set<string>()
	const issues: Omit<Issue, "firstDetected">[] = []
	for (const edge of graph.edges) {
		if (edge.kind !== "dependency") continue
		if (!fileIds.has(edge.source) || !fileIds.has(edge.target)) continue
		if (!directed.has(`${edge.target}|${edge.source}`)) continue

		// Canonicalize the pair so we only emit one issue per (a,b).
		const a = edge.source < edge.target ? edge.source : edge.target
		const b = edge.source < edge.target ? edge.target : edge.source
		const key = `${a}|${b}`
		if (seen.has(key)) continue
		seen.add(key)

		const aPath = labelOf.get(a) ?? a
		const bPath = labelOf.get(b) ?? b
		issues.push({
			id: `bidirectional:${a}<->${b}`,
			category: "bidirectional-dependency",
			severity: "warning",
			title: `Bidirectional dependency: ${aPath} ↔ ${bPath}`,
			description:
				"These two files import from each other. Even when this doesn't " +
				"trigger an initialization bug, it signals that the boundary between " +
				"them has leaked — they're effectively one module wearing two file masks.",
			affected: [aPath, bPath]
		})
	}
	return issues
}
