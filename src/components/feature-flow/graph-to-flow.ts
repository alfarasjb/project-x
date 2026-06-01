import type { Edge, Node } from "@xyflow/react"
import type { Graph } from "@shared/schemas/graph"

/**
 * Map a stored feature-flow `Graph` to ReactFlow nodes + edges for the
 * `FeatureFlowCanvas`.
 *
 * A feature flow is small and curated, so unlike the project canvas it carries
 * its own layout: each node's `position` (and optional `size`) is authored when
 * the flow is created/derived, so there's no `layoutGraph` pass here — we map
 * straight through. Nodes with no position fall back to the origin (a flow with
 * unpositioned nodes is a data bug, not a render-time layout concern).
 *
 * Node `data` mirrors the shape the shared `module` / `file` / `symbol` node
 * components read (label, kind, layer, path, signature, description), so a flow
 * renders with the same visual vocabulary as the parsed graph.
 */

/** Module → "module", File → "file", everything else → "symbol" — matches GraphCanvas. */
function nodeType(kind: string): string {
	if (kind === "module") return "module"
	if (kind === "file") return "file"
	return "symbol"
}

/** Fallback box when a node omits an explicit size. */
const DEFAULT_SIZE = { width: 240, height: 64 }

export function graphToFlow(graph: Graph): { nodes: Node[]; edges: Edge[] } {
	const nodes: Node[] = graph.nodes.map((node) => ({
		id: node.id,
		type: nodeType(node.kind),
		position: node.position ?? { x: 0, y: 0 },
		parentId: node.parentId ?? undefined,
		extent: node.parentId ? "parent" : undefined,
		style: node.size ?? DEFAULT_SIZE,
		data: {
			label: node.label,
			kind: node.kind,
			layer: node.layer,
			path: node.path,
			signature: node.signature,
			description: node.description
		}
	}))

	const edges: Edge[] = graph.edges.map((edge) => ({
		id: edge.id,
		source: edge.source,
		target: edge.target,
		type: "default",
		...(edge.interface !== undefined ? { label: edge.interface } : {})
	}))

	return { nodes, edges }
}
