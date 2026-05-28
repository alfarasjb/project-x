import type { Graph, GraphNode } from "@shared/schemas/graph"
import type { Issue } from "@shared/schemas/issue"
import { findSimilarNodes } from "@server/domain/embeddings/similarity"

/**
 * Duplicate-candidates — surface CLUSTERS of nodes whose embedding-document
 * text sits below a tight cosine threshold. The "you wrote this N times"
 * finding.
 *
 * Unlike the heuristic rules in this directory, this one is **async + needs
 * DB access** (queries the pgvector index via `findSimilarNodes`). It runs
 * AFTER `embedNodes` so the vectors it queries are fresh, and it no-ops
 * cleanly on projects without embeddings: `findSimilarNodes` returns `[]`
 * for any node without a stored vector.
 *
 * Clustering, not pairs: each sub-threshold neighbour relation is an
 * undirected edge; connected components (union-find) collapse a group of
 * mutually-similar files into ONE finding instead of N-choose-2 pair cards.
 * Because cosine similarity isn't transitive, a component can sweep in a node
 * that only resembles one other member — the `refine-duplicate-cluster`
 * handler is the precision pass that splits those back out (`excluded`).
 *
 * v1 clusters file + module nodes. Function-level duplicate detection needs
 * the analyze pass to describe symbol nodes first — a separate milestone.
 */

/**
 * Distance cutoff below which two nodes are linked. Per the MCP tool surface
 * description: 0 = identical, ~0.3 = strong, ~0.5 = topical, >0.7 = weak.
 * Dropped from 0.4 to 0.3 after running the audit on project-x — 0.4 picked
 * up too many topical pairs. 0.3 keeps the "strong" matches only. Can loosen
 * again now that the refinement handler vetoes false positives as a second pass.
 */
const DEFAULT_THRESHOLD = 0.3

/** Per-node fan-out — keep modest so audit time stays bounded on big graphs. */
const NEIGHBOURS_PER_NODE = 5

const EMBEDDABLE_KINDS: ReadonlySet<string> = new Set(["file", "module"])

export async function duplicateCandidates(
	projectId: string,
	graph: Graph
): Promise<Omit<Issue, "firstDetected">[]> {
	const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
	const clusters = new UnionFind()

	// 1. Link every node to each sub-threshold neighbour (undirected edge).
	for (const node of graph.nodes) {
		if (!EMBEDDABLE_KINDS.has(node.kind)) continue
		const neighbours = await findSimilarNodes({
			projectId,
			nodeId: node.id,
			k: NEIGHBOURS_PER_NODE
		})
		for (const neighbour of neighbours) {
			if (neighbour.distance >= DEFAULT_THRESHOLD) continue
			if (!nodeById.has(neighbour.nodeId)) continue
			clusters.union(node.id, neighbour.nodeId)
		}
	}

	// 2. Emit one issue per connected component of 2+ members.
	const issues: Omit<Issue, "firstDetected">[] = []
	for (const memberIds of clusters.components()) {
		const members = memberIds
			.slice()
			.sort()
			.map((id) => nodeById.get(id))
			.filter((node): node is GraphNode => node !== undefined)
		if (members.length < 2) continue
		issues.push(buildClusterIssue(members))
	}
	return issues
}

function buildClusterIssue(members: readonly GraphNode[]): Omit<Issue, "firstDetected"> {
	const ids = members.map((node) => node.id)
	const paths = members.map((node) => node.path)
	const kinds = new Set(members.map((node) => node.kind))
	const first = members[0]
	const kindLabel = kinds.size === 1 && first ? `${first.kind}s` : "nodes"
	const isPair = members.length === 2

	const title = isPair
		? `Possible duplicate: ${paths[0]} ↔ ${paths[1]}`
		: `Possible duplicate cluster: ${members.length} ${kindLabel}`
	const description = isPair
		? `These two ${kindLabel} have very similar descriptions and may be doing the same ` +
			`work — worth consolidating — or one may be a copy that drifted from its original. ` +
			`Open both and confirm before refactoring.`
		: `These ${members.length} ${kindLabel} have very similar descriptions and may overlap: ` +
			`${paths.join(", ")}. Some may be consolidatable; others may just be proximity-only ` +
			`matches. Confirm before refactoring.`

	return {
		id: `duplicate-candidates:${ids.join("|")}`,
		category: "duplicate-candidates",
		severity: "info",
		title,
		description,
		affected: paths
	}
}

/**
 * Minimal union-find over string ids. Only ids passed to `union` are tracked,
 * so `components()` returns just the clustered nodes (singletons never appear).
 */
class UnionFind {
	private readonly parent = new Map<string, string>()

	private add(id: string): void {
		if (!this.parent.has(id)) this.parent.set(id, id)
	}

	find(id: string): string {
		this.add(id)
		let root = id
		for (;;) {
			const next = this.parent.get(root)
			if (next === undefined || next === root) break
			root = next
		}
		// Path compression.
		let cursor = id
		for (;;) {
			const next = this.parent.get(cursor)
			if (next === undefined || next === root) break
			this.parent.set(cursor, root)
			cursor = next
		}
		return root
	}

	union(a: string, b: string): void {
		const rootA = this.find(a)
		const rootB = this.find(b)
		if (rootA !== rootB) this.parent.set(rootA, rootB)
	}

	components(): string[][] {
		const groups = new Map<string, string[]>()
		for (const id of this.parent.keys()) {
			const root = this.find(id)
			const bucket = groups.get(root)
			if (bucket) bucket.push(id)
			else groups.set(root, [id])
		}
		return [...groups.values()]
	}
}
