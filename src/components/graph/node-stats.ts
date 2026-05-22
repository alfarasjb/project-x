import type { Graph, GraphNode } from "@shared/schemas/graph"

/**
 * Subtree stats for container nodes — what a module/file holds, surfaced in its
 * header so a collapsed box still tells you what's inside.
 */

/** Counts across a container's whole containment subtree. */
export interface NodeStats {
	files: number
	symbols: number
	/** File-tier dependency edges with both endpoints inside the subtree. */
	edges: number
}

/** Per-container subtree stats, keyed by node id. Leaf nodes are absent. */
export function computeNodeStats(graph: Graph): Map<string, NodeStats> {
	const childrenOf = new Map<string, GraphNode[]>()
	for (const node of graph.nodes) {
		if (!node.parentId) continue
		const arr = childrenOf.get(node.parentId)
		if (arr) arr.push(node)
		else childrenOf.set(node.parentId, [node])
	}

	const kindOf = new Map(graph.nodes.map((n) => [n.id, n.kind]))

	// Descendant id set per node — memoized recursion over the containment tree.
	const descendantsOf = new Map<string, Set<string>>()
	function descendants(id: string): Set<string> {
		const cached = descendantsOf.get(id)
		if (cached) return cached
		const set = new Set<string>()
		for (const child of childrenOf.get(id) ?? []) {
			set.add(child.id)
			for (const nested of descendants(child.id)) set.add(nested)
		}
		descendantsOf.set(id, set)
		return set
	}

	const stats = new Map<string, NodeStats>()
	for (const node of graph.nodes) {
		const subtree = descendants(node.id)
		if (subtree.size === 0) continue // leaf — nothing to summarise

		let files = 0
		let symbols = 0
		for (const id of subtree) {
			const kind = kindOf.get(id)
			if (kind === "file") files++
			else if (kind !== "module") symbols++
		}

		let edges = 0
		for (const edge of graph.edges) {
			if (
				subtree.has(edge.source) &&
				subtree.has(edge.target) &&
				kindOf.get(edge.source) !== "module" &&
				kindOf.get(edge.target) !== "module"
			) {
				edges++
			}
		}

		stats.set(node.id, { files, symbols, edges })
	}
	return stats
}

/** A compact header label — `files · edges` for a module, `defs` for a file. */
export function formatNodeStats(kind: string, stats: NodeStats): string {
	const plural = (n: number, word: string): string => `${n} ${n === 1 ? word : `${word}s`}`
	if (kind === "module") {
		const parts = [plural(stats.files, "file")]
		if (stats.edges > 0) parts.push(plural(stats.edges, "edge"))
		return parts.join(" · ")
	}
	return plural(stats.symbols, "def")
}
