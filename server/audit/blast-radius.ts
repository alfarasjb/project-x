import type { Graph, GraphNode } from "@shared/schemas/graph"
import type { BlastRadius } from "@shared/schemas/issue"

/**
 * Blast radius — for a given node, how many other nodes transitively
 * depend on it (upstream) and how many it transitively depends on
 * (downstream). The audit attaches the result to each emitted issue so
 * cards can show their reach: a god file with 47 dependents is a
 * fundamentally bigger problem than one with 2, even if the heuristics
 * fire the same.
 *
 * Computed at file granularity AND module granularity from the parser's
 * dependency edges. Symbol-level blast radius would require a call
 * graph, which the parser doesn't build yet — symbol nodes return zeros.
 *
 * Naive: per-node BFS over each subgraph. O(N * (N + E)) for the whole
 * graph. Fine at MVP scale (~hundreds of nodes); revisit when a real
 * project's analyze noticeably stalls here.
 */
export function computeBlastRadii(graph: Graph): Map<string, BlastRadius> {
	const fileAdj = buildAdjacency(graph, "file")
	const moduleAdj = buildAdjacency(graph, "module")
	const moduleByPath = new Map(
		graph.nodes.filter((node) => node.kind === "module").map((node) => [node.path, node])
	)
	const fileByPath = new Map(
		graph.nodes.filter((node) => node.kind === "file").map((node) => [node.path, node])
	)
	const out = new Map<string, BlastRadius>()
	for (const node of graph.nodes) {
		if (node.kind === "file") {
			out.set(node.id, computeOne(node, fileAdj, moduleByPath, fileByPath))
		} else if (node.kind === "module") {
			out.set(node.id, computeOne(node, moduleAdj, moduleByPath, fileByPath))
		}
	}
	return out
}

interface Adjacency {
	/** id → ids it depends on (outgoing dependency edges). */
	downstream: Map<string, Set<string>>
	/** id → ids that depend on it (incoming dependency edges). */
	upstream: Map<string, Set<string>>
}

function buildAdjacency(graph: Graph, kind: "file" | "module"): Adjacency {
	const kindById = new Map(graph.nodes.map((node) => [node.id, node.kind]))
	const downstream = new Map<string, Set<string>>()
	const upstream = new Map<string, Set<string>>()
	for (const edge of graph.edges) {
		if (edge.kind !== "dependency") continue
		if (kindById.get(edge.source) !== kind || kindById.get(edge.target) !== kind) continue
		addToSet(downstream, edge.source, edge.target)
		addToSet(upstream, edge.target, edge.source)
	}
	return { downstream, upstream }
}

function addToSet(map: Map<string, Set<string>>, key: string, value: string): void {
	const set = map.get(key) ?? new Set<string>()
	set.add(value)
	map.set(key, set)
}

function computeOne(
	node: GraphNode,
	adj: Adjacency,
	moduleByPath: Map<string, GraphNode>,
	fileByPath: Map<string, GraphNode>
): BlastRadius {
	const downstreamSet = traverse(node.id, adj.downstream)
	const upstreamSet = traverse(node.id, adj.upstream)
	const union = new Set([...downstreamSet, ...upstreamSet])
	const modulesTouched = countModulesTouched(union, moduleByPath, fileByPath)
	return {
		total: union.size,
		upstream: upstreamSet.size,
		downstream: downstreamSet.size,
		modulesTouched
	}
}

/** BFS the adjacency starting from `root`. Excludes the root from the result set. */
function traverse(root: string, edges: Map<string, Set<string>>): Set<string> {
	const visited = new Set<string>()
	const queue: string[] = [root]
	while (queue.length > 0) {
		const current = queue.shift()
		if (current === undefined) break
		const neighbors = edges.get(current)
		if (!neighbors) continue
		for (const next of neighbors) {
			if (visited.has(next) || next === root) continue
			visited.add(next)
			queue.push(next)
		}
	}
	return visited
}

/**
 * Count unique modules touched by a set of node ids. For file ids we
 * walk up to the containing module (its directory path); for module ids
 * they ARE the module. Used so a single bad file showing up in 30
 * modules surfaces as "30 modules touched" not "1 file touched."
 */
function countModulesTouched(
	nodeIds: ReadonlySet<string>,
	moduleByPath: Map<string, GraphNode>,
	fileByPath: Map<string, GraphNode>
): number {
	const modules = new Set<string>()
	for (const id of nodeIds) {
		if (moduleByPath.has(id)) {
			modules.add(id)
			continue
		}
		const file = fileByPath.get(id)
		if (!file?.parentId) continue
		modules.add(file.parentId)
	}
	return modules.size
}
