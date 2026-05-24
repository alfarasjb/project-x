import type { Graph } from "@shared/schemas/graph"
import type { Issue } from "@shared/schemas/issue"
import { findSimilarNodes } from "@server/domain/embeddings/similarity"

/**
 * Duplicate-candidates — surface peer pairs whose embedding-document text
 * sits below a tight cosine threshold. The "you wrote this twice" finding.
 *
 * Unlike the heuristic rules in this directory, this one is **async + needs
 * DB access** (queries the pgvector index via `findSimilarNodes`). It runs
 * AFTER `embedNodes` so the vectors it queries are fresh, and it no-ops
 * cleanly on projects without embeddings: `findSimilarNodes` returns `[]`
 * for any node without a stored vector.
 *
 * v1 is file + module only. Function-level duplicate detection is the
 * obvious next step but needs the analyze pass to describe symbol nodes
 * first — that's a separate milestone.
 *
 * Pair dedupe: similarity is symmetric, so without ordering we'd emit the
 * same finding twice. Lexicographic sort on `(aId, bId)` collapses both
 * directions into one issue.
 */

/**
 * Distance cutoff below which a pair is reported. Per the MCP tool surface
 * description: 0 = identical, ~0.3 = strong, ~0.5 = topical, >0.7 = weak.
 * Dropped from 0.4 to 0.3 after running the audit on project-x — 0.4 picked
 * up too many topical pairs (route handlers that look architecturally
 * similar but aren't duplicates). 0.3 keeps the "strong" matches only.
 * Revisit once the duplicates handler exists and can veto false positives;
 * the threshold can loosen again with the handler as a second-pass filter.
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
	const issues: Omit<Issue, "firstDetected">[] = []
	const seenPairs = new Set<string>()

	for (const node of graph.nodes) {
		if (!EMBEDDABLE_KINDS.has(node.kind)) continue

		const neighbours = await findSimilarNodes({
			projectId,
			nodeId: node.id,
			k: NEIGHBOURS_PER_NODE
		})

		for (const neighbour of neighbours) {
			if (neighbour.distance >= DEFAULT_THRESHOLD) continue
			const other = nodeById.get(neighbour.nodeId)
			if (!other) continue

			const sortedIds = [node.id, other.id].sort()
			const aId = sortedIds[0]
			const bId = sortedIds[1]
			if (!aId || !bId) continue
			const pairKey = `${aId}|${bId}`
			if (seenPairs.has(pairKey)) continue
			seenPairs.add(pairKey)

			const a = nodeById.get(aId)
			const b = nodeById.get(bId)
			if (!a || !b) continue

			const kindLabel = a.kind === b.kind ? `${a.kind}s` : "nodes"
			issues.push({
				id: `duplicate-candidates:${aId}|${bId}`,
				category: "duplicate-candidates",
				severity: "info",
				title: `Possible duplicate: ${a.path} ↔ ${b.path}`,
				description:
					`These two ${kindLabel} have very similar descriptions and may be ` +
					`doing the same work — worth consolidating — or one may be a copy ` +
					`that drifted from its original. Open both and confirm before refactoring.`,
				affected: [a.path, b.path]
			})
		}
	}

	return issues
}
