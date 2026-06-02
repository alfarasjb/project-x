import { z } from "zod"
import { EMPTY_GRAPH, type GraphNode } from "@shared/schemas/graph"
import { getProjectGraph } from "@server/domain/graph"
import { findSimilarNodes } from "@server/domain/embeddings/similarity"
import { defineTool } from "@server/tools/types"

/**
 * `projectx_find_similar_to_node` — top-K nodes most similar to a source node
 * (excluding itself), via the pgvector embedding backend. Used by an agent to
 * discover a node's neighbours: files doing similar work, likely-coupled peers,
 * or consolidation candidates.
 */
export const findSimilarToNodeTool = defineTool({
	name: "projectx_find_similar_to_node",
	describe: (projectName) =>
		`Find the top-K nodes most similar to a given source node in "${projectName}", excluding the source itself. Backed by vector embeddings of each node's path + classification + summary (Voyage code-3, cosine distance).

Use this when you've ALREADY found one relevant node and want to discover its NEIGHBOURS — files that do similar work, that probably want to be touched together, or that may be duplicates. Defaults to peer-level matches (a file matches files); pass kinds to widen.

Args:
  - node_id (string): id of the source node (its path), e.g. "src/lib/storage.ts".
  - k (number, optional): how many results to return. Default 5, max 25.
  - kinds (array of "file" | "module", optional): restrict to certain node kinds. Defaults to the source node's own kind.

Returns JSON: { source: { nodeId, kind, summary }, count, results: [{ nodeId, kind, distance, classification, summary }] }. Empty results = the source node has no embedding yet (it must be Analyzed first) OR no other nodes are embedded.`,
	inputSchema: z.object({
		node_id: z.string().min(1).describe("Id of the source node (its path)."),
		k: z.number().int().min(1).max(25).optional().describe("Top K results to return. Default 5."),
		kinds: z
			.array(z.enum(["file", "module"]))
			.optional()
			.describe("Restrict to certain node kinds. Defaults to the source node's kind.")
	}),
	handler: async ({ ctx, input }) => {
		const graph = (await getProjectGraph(ctx.projectId))?.actual ?? EMPTY_GRAPH
		const nodesById = new Map<string, GraphNode>(graph.nodes.map((node) => [node.id, node]))
		const source = nodesById.get(input.node_id)
		const results = await findSimilarNodes({
			projectId: ctx.projectId,
			nodeId: input.node_id,
			k: input.k ?? 5,
			...(input.kinds ? { kinds: input.kinds } : {})
		})
		const enriched = results.map((result) => {
			const node = nodesById.get(result.nodeId)
			return {
				nodeId: result.nodeId,
				kind: result.kind,
				distance: Number(result.distance.toFixed(4)),
				classification: node?.classification ?? null,
				summary: node?.description?.what ?? null
			}
		})
		return {
			source: source
				? { nodeId: source.id, kind: source.kind, summary: source.description?.what ?? null }
				: { nodeId: input.node_id, kind: null, summary: null },
			count: enriched.length,
			results: enriched
		}
	}
})
