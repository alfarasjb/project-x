import { z } from "zod"
import { EMPTY_GRAPH } from "@shared/schemas/graph"
import { getProjectGraph } from "@server/domain/graph"
import { defineTool } from "@server/tools/types"

/**
 * `projectx_list_nodes` — paginated inventory of module + file nodes, each with
 * its current description and classification. Symbol-level nodes are excluded.
 */
export const listNodesTool = defineTool({
	name: "projectx_list_nodes",
	describe: (projectName) =>
		`List nodes in the architecture graph for "${projectName}" — modules (folders) and files — each with its current description and classification.

Use this to take inventory of the codebase, to find which nodes still need a description (filter described=false), or which still need a classification (filter classified=false). To inspect one node's connections, use projectx_get_node.

Args:
  - kind (string, optional): restrict to one kind, e.g. "module" or "file". Omit for both modules and files (symbol-level nodes are excluded).
  - described (boolean, optional): true → only nodes with a description; false → only nodes without one; omit → all.
  - classified (boolean, optional): true → only nodes with a classification; false → only nodes without one; omit → all.
  - limit (number): max nodes to return, 1-500 (default 200).
  - offset (number): nodes to skip, for pagination (default 0).

Returns JSON: { total, count, offset, has_more, nodes: [{ id, path, kind, label, described, description, classified, classification }] }. A node's "id" is its path — pass it as node_id to projectx_get_node.`,
	inputSchema: z.object({
		kind: z
			.string()
			.min(1)
			.optional()
			.describe('Restrict to one kind, e.g. "module" or "file". Omit for modules + files.'),
		described: z
			.boolean()
			.optional()
			.describe("Filter by whether the node has a description. Omit for all nodes."),
		classified: z
			.boolean()
			.optional()
			.describe("Filter by whether the node has a classification. Omit for all nodes."),
		limit: z.number().int().min(1).max(500).default(200).describe("Max nodes to return."),
		offset: z.number().int().min(0).default(0).describe("Nodes to skip, for pagination.")
	}),
	handler: async ({ ctx, input }) => {
		const graph = (await getProjectGraph(ctx.projectId))?.actual ?? EMPTY_GRAPH
		const byKind = input.kind
			? graph.nodes.filter((node) => node.kind === input.kind)
			: graph.nodes.filter((node) => node.kind === "module" || node.kind === "file")
		const byDescribed =
			input.described === undefined
				? byKind
				: byKind.filter((node) => (node.description !== undefined) === input.described)
		const filtered =
			input.classified === undefined
				? byDescribed
				: byDescribed.filter((node) => (node.classification !== undefined) === input.classified)
		const page = filtered.slice(input.offset, input.offset + input.limit)
		return {
			total: filtered.length,
			count: page.length,
			offset: input.offset,
			has_more: input.offset + page.length < filtered.length,
			nodes: page.map((node) => ({
				id: node.id,
				path: node.path,
				kind: node.kind,
				label: node.label,
				described: node.description !== undefined,
				description: node.description ?? null,
				classified: node.classification !== undefined,
				classification: node.classification ?? null
			}))
		}
	}
})
