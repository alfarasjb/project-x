import type { Graph } from "@shared/schemas/graph"
import type { Issue } from "@shared/schemas/issue"

/**
 * Circular dependency detection — DFS over file-level dependency edges.
 * Returns one issue per distinct cycle, deduped by the canonical
 * (sorted-rotated) cycle id so `A→B→A` and `B→A→B` are the same finding.
 *
 * Module-level edges are skipped: a cycle between two directories is
 * almost always a side-effect of file-level cycles inside them, and
 * surfacing both would just clutter the feed.
 */
export function circularDependencies(graph: Graph): Omit<Issue, "firstDetected">[] {
	const fileIds = new Set(graph.nodes.filter((node) => node.kind === "file").map((node) => node.id))
	const labelOf = new Map<string, string>(
		graph.nodes.filter((node) => fileIds.has(node.id)).map((node) => [node.id, node.path])
	)

	// Adjacency list: file id → file ids it directly depends on.
	const adj = new Map<string, string[]>()
	for (const id of fileIds) adj.set(id, [])
	for (const edge of graph.edges) {
		if (edge.kind !== "dependency") continue
		if (!fileIds.has(edge.source) || !fileIds.has(edge.target)) continue
		adj.get(edge.source)?.push(edge.target)
	}

	const cycles = new Set<string>()
	const cyclePaths: string[][] = []
	const visiting = new Set<string>()
	const visited = new Set<string>()
	const stack: string[] = []

	function visit(node: string): void {
		if (visited.has(node)) return
		if (visiting.has(node)) {
			// Cycle: slice the stack from the second occurrence of `node` to the end.
			const start = stack.indexOf(node)
			if (start === -1) return
			const cycle = stack.slice(start)
			const key = canonical(cycle)
			if (!cycles.has(key)) {
				cycles.add(key)
				cyclePaths.push(cycle)
			}
			return
		}
		visiting.add(node)
		stack.push(node)
		for (const next of adj.get(node) ?? []) visit(next)
		stack.pop()
		visiting.delete(node)
		visited.add(node)
	}

	for (const id of fileIds) visit(id)

	return cyclePaths.map((cycle) => {
		const display = cycle.map((id) => labelOf.get(id) ?? id)
		const id = `circular:${canonical(cycle)}`
		const arrow = `${display.join(" → ")} → ${display[0] ?? ""}`
		return {
			id,
			category: "circular-dependency",
			severity: "critical" as const,
			title: `Circular dependency: ${arrow}`,
			description:
				"Files import each other in a cycle. This breaks tree-shaking, " +
				"can cause initialization-order bugs (one module ends up undefined " +
				"when the other reads it), and makes the boundary between them ambiguous.",
			affected: display
		}
	})
}

/**
 * Canonical key for a cycle — rotate so the lexicographically smallest id
 * comes first. `A→B→C→A` and `B→C→A→B` collapse to the same key.
 */
function canonical(cycle: string[]): string {
	if (cycle.length === 0) return ""
	let min = 0
	for (let i = 1; i < cycle.length; i++) {
		if ((cycle[i] ?? "") < (cycle[min] ?? "")) min = i
	}
	return [...cycle.slice(min), ...cycle.slice(0, min)].join("->")
}
