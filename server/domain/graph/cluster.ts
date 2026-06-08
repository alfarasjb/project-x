import { UndirectedGraph } from "graphology"
import louvain from "graphology-communities-louvain"
import type { Graph } from "@shared/schemas/graph"

/** Result of partitioning a graph's files into communities. Pure data. */
export interface Partition {
	/** file node id → cluster id (`cluster-<n>`). */
	byNode: Map<string, string>
	/** distinct cluster ids, in first-seen order. */
	clusterIds: string[]
}

/**
 * Fixed seed so the same topology always yields the same partition. Without it
 * Louvain's random node-visit order would reshuffle clusters on every analyze,
 * detaching the AI labels from their members.
 */
const PARTITION_SEED = 0x5eed

/**
 * Mulberry32 — a tiny deterministic PRNG, enough to seed Louvain's node order.
 */
function seededRng(seed: number): () => number {
	let a = seed
	return () => {
		a = (a + 0x6d2b79f5) | 0
		let t = Math.imul(a ^ (a >>> 15), 1 | a)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/**
 * Partition the graph's FILE nodes into community-detection clusters — Louvain
 * over file→file import edges. Pure: returns the assignment, mutates nothing.
 *
 * Only file nodes participate: clusters are a file-level partition (a directory
 * spans clusters; a symbol inherits its file's cluster at render). Module nodes
 * and module-level edges are skipped, as is any non-`dependency` edge. Files
 * with no in-repo imports each form their own singleton cluster. An empty graph
 * (or one with no files) yields an empty partition.
 */
export function partitionGraph(graph: Graph): Partition {
	const fileIds = new Set(graph.nodes.filter((node) => node.kind === "file").map((node) => node.id))
	if (fileIds.size === 0) return { byNode: new Map(), clusterIds: [] }

	const topology = new UndirectedGraph()
	for (const id of fileIds) topology.addNode(id)
	for (const edge of graph.edges) {
		if (edge.kind !== "dependency") continue
		if (edge.source === edge.target) continue
		if (!fileIds.has(edge.source) || !fileIds.has(edge.target)) continue
		topology.mergeUndirectedEdge(edge.source, edge.target)
	}

	// Louvain optimises modularity over edges; handed an edgeless graph there is
	// nothing to do, so make every file its own singleton directly.
	const assignment =
		topology.size === 0
			? Object.fromEntries([...fileIds].map((id, index) => [id, index]))
			: louvain(topology, { rng: seededRng(PARTITION_SEED) })

	const byNode = new Map<string, string>()
	const clusterIds: string[] = []
	const seen = new Set<string>()
	for (const id of fileIds) {
		const clusterId = `cluster-${assignment[id] ?? 0}`
		byNode.set(id, clusterId)
		if (!seen.has(clusterId)) {
			seen.add(clusterId)
			clusterIds.push(clusterId)
		}
	}
	return { byNode, clusterIds }
}
