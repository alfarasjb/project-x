import { z } from "zod"
import { EMPTY_GRAPH, type GraphNode } from "@shared/schemas/graph"
import { getProjectGraph } from "@server/domain/graph"
import { findSimilarToText } from "@server/domain/embeddings/similarity"
import { defineTool } from "@server/tools/types"

/**
 * `projectx_search_similar_nodes` — top-K nodes whose descriptions are most
 * semantically similar to a free-form text query, via the pgvector embedding
 * backend. The text→node counterpart of `findSimilarToNodeTool` (which is
 * node→node): this one embeds the query itself, so it's the right first move
 * when you don't yet have a node in hand ("where does auth happen?").
 *
 * Shared def — consumed in-process by the QA agent loop and wrapped by the MCP
 * server, the same "one def, many transports" pattern as the other read tools.
 */
export const findSimilarToTextTool = defineTool({
	name: "projectx_search_similar_nodes",
	describe: (projectName) =>
		`Find the top-K nodes in "${projectName}" whose descriptions are most semantically similar to a free-form text query. Backed by vector embeddings of each node's path + classification + summary + rationale (Voyage code-3, 1024 dims, cosine distance).

Use this to FIND CODE BY INTENT — "where does auth happen?", "which file handles localStorage?", "is there already a date formatter?". This is the right first move when you're looking for a place to put new code or a primitive that might already exist. Pair with projectx_get_node on the top result to inspect details.

Args:
  - query (string): the text to search for. Plain English is fine ("save todos to disk"); structural terms work too ("routing layer").
  - k (number, optional): how many results to return. Default 5, max 25.
  - kinds (array of "file" | "module", optional): restrict to certain node kinds. Default ["file", "module"] (both).

Returns JSON: { query, count, results: [{ nodeId, kind, distance, classification, summary }] }. Lower distance = better match (0 = identical, ~0.3 = strong, ~0.5 = topical, >0.7 = weak). Empty results = no nodes have been embedded yet (the project must be Analyzed first, which triggers embedding) OR the VOYAGE_API_KEY is unset on the server.`,
	inputSchema: z.object({
		query: z.string().min(1).describe("Free-form text to search for."),
		k: z.number().int().min(1).max(25).optional().describe("Top K results to return. Default 5."),
		kinds: z
			.array(z.enum(["file", "module"]))
			.optional()
			.describe('Restrict to certain node kinds. Default ["file", "module"].')
	}),
	handler: async ({ ctx, input }) => {
		const graph = ctx.graph ?? (await getProjectGraph(ctx.projectId))?.actual ?? EMPTY_GRAPH
		const nodesById = new Map<string, GraphNode>(graph.nodes.map((node) => [node.id, node]))
		const results = await findSimilarToText({
			projectId: ctx.projectId,
			text: input.query,
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
		return { query: input.query, count: enriched.length, results: enriched }
	}
})
