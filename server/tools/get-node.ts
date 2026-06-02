import { z } from "zod"
import type { GraphNode } from "@shared/schemas/graph"
import { getProjectGraph, resolveNodeDetail } from "@server/domain/graph"
import { AppError } from "@server/utils/errors"
import { defineTool } from "@server/tools/types"

/** A node trimmed to the fields worth showing in an edge reference or child list. */
function briefNode(node: GraphNode): { id: string; kind: string; label: string } {
	return { id: node.id, kind: node.kind, label: node.label }
}

/**
 * `projectx_get_node` — full detail for one node plus its immediate graph
 * context (containment + edges). The unit an agent walks to trace a flow:
 * get a node, follow a dependency, get the next node, repeat.
 */
export const getNodeTool = defineTool({
	name: "projectx_get_node",
	describe: (projectName) =>
		`Get full detail for one node in the architecture graph for "${projectName}": its kind, path, layer, signature, description, containment children, and the edges in and out of it.

Use this to inspect a specific node and to TRACE A FLOW — get a node, follow one of its "dependencies" to the next node, call projectx_get_node again, and repeat. Use projectx_list_nodes to discover node ids.

Args:
  - node_id (string): the node's id, which is its path (e.g. "server/domain/graph/index.ts" for a file, or "server/domain/graph" for a module).

Returns JSON: {
  id, path, kind, label, layer, classification, signature, description,
  parent: { id, label } | null,
  children: [{ id, kind, label }],       // nodes contained inside this one
  dependencies: [{ id, kind, label }],   // nodes this node imports / depends on
  dependents: [{ id, kind, label }]      // nodes that import / depend on this one
}. Errors if the node is unknown.`,
	inputSchema: z.object({
		node_id: z
			.string()
			.min(1)
			.describe('The node id (its path), e.g. "server/domain/graph/index.ts".')
	}),
	handler: async ({ ctx, input }) => {
		// Use the caller-provided graph when present (agent loop); else read it once.
		const graph = ctx.graph ?? (await getProjectGraph(ctx.projectId))?.actual
		if (!graph) throw new AppError(404, `Project not found: ${ctx.projectId}`)
		const detail = resolveNodeDetail(graph, input.node_id)
		if (!detail) throw new AppError(404, `No node "${input.node_id}" in the actual graph.`)
		return {
			id: detail.node.id,
			path: detail.node.path,
			kind: detail.node.kind,
			label: detail.node.label,
			layer: detail.node.layer ?? null,
			classification: detail.node.classification ?? null,
			signature: detail.node.signature ?? null,
			description: detail.node.description ?? null,
			parent: detail.parent ? { id: detail.parent.id, label: detail.parent.label } : null,
			children: detail.children.map(briefNode),
			dependencies: detail.dependencies.map(briefNode),
			dependents: detail.dependents.map(briefNode)
		}
	}
})
