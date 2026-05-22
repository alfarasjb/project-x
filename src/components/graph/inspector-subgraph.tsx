import { useCallback, useMemo } from "react"
import { Background, ReactFlow, type Edge, type Node, type NodeMouseHandler } from "@xyflow/react"
import type { GraphNode } from "@shared/schemas/graph"
import { InspectorGraphNode } from "./inspector-graph-node"

/**
 * The inspector's focused subgraph — a flat mini-graph of every node
 * edge-connected to the selected one. Deliberately *flat*: no module/file
 * containers, no nesting; the only structure is the dependency edges
 * themselves. Layered vertically by hop-distance (downstream below, upstream
 * above) so it reads as a path. Clicking a node re-centres the inspector on it.
 */

// Defined once at module scope — re-creating breaks ReactFlow internals.
const nodeTypes = { inspector: InspectorGraphNode }

const ROW_GAP = 78
const COL_GAP = 176

/** Forward (source→targets) and reverse (target→sources) adjacency. */
function buildAdjacency(edges: Edge[]): {
	forward: Map<string, string[]>
	reverse: Map<string, string[]>
} {
	const forward = new Map<string, string[]>()
	const reverse = new Map<string, string[]>()
	const link = (map: Map<string, string[]>, from: string, to: string): void => {
		const list = map.get(from)
		if (list) list.push(to)
		else map.set(from, [to])
	}
	for (const edge of edges) {
		link(forward, edge.source, edge.target)
		link(reverse, edge.target, edge.source)
	}
	return { forward, reverse }
}

/** Hop-distance from `start` over an adjacency map (BFS). */
function bfs(adjacency: Map<string, string[]>, start: string): Map<string, number> {
	const dist = new Map<string, number>([[start, 0]])
	const queue = [start]
	let head = 0
	while (head < queue.length) {
		const current = queue[head]
		head += 1
		if (current === undefined) continue
		const depth = dist.get(current) ?? 0
		for (const next of adjacency.get(current) ?? []) {
			if (!dist.has(next)) {
				dist.set(next, depth + 1)
				queue.push(next)
			}
		}
	}
	return dist
}

/**
 * Lay the edge-connected component of `selectedId` into a flat, vertically
 * layered graph: layer = signed hop-distance (downstream positive/below,
 * upstream negative/above), nodes spread and centred within each layer.
 */
function buildSubgraph(
	selectedId: string,
	canvasEdges: Edge[],
	nodesById: Map<string, GraphNode>
): { nodes: Node[]; edges: Edge[] } {
	const { forward, reverse } = buildAdjacency(canvasEdges)
	const downstream = bfs(forward, selectedId)
	const upstream = bfs(reverse, selectedId)

	const layer = new Map<string, number>()
	for (const [id, d] of upstream) layer.set(id, -d)
	for (const [id, d] of downstream) layer.set(id, d)
	layer.set(selectedId, 0)

	const byLayer = new Map<number, string[]>()
	for (const [id, l] of layer) {
		const row = byLayer.get(l)
		if (row) row.push(id)
		else byLayer.set(l, [id])
	}

	const nodes: Node[] = []
	for (const [l, ids] of byLayer) {
		ids.sort((a, b) => (nodesById.get(a)?.label ?? a).localeCompare(nodesById.get(b)?.label ?? b))
		ids.forEach((id, i) => {
			const node = nodesById.get(id)
			nodes.push({
				id,
				type: "inspector",
				position: { x: (i - (ids.length - 1) / 2) * COL_GAP, y: l * ROW_GAP },
				data: {
					label: node?.label ?? id,
					kind: node?.kind ?? "node",
					isSelected: id === selectedId
				}
			})
		})
	}

	const edges: Edge[] = canvasEdges
		.filter((edge) => layer.has(edge.source) && layer.has(edge.target))
		.map((edge) => ({ id: edge.id, source: edge.source, target: edge.target }))

	return { nodes, edges }
}

export function InspectorSubgraph({
	selectedId,
	nodesById,
	edges,
	onSelect
}: {
	selectedId: string
	nodesById: Map<string, GraphNode>
	edges: Edge[]
	onSelect: (id: string) => void
}) {
	const subgraph = useMemo(
		() => buildSubgraph(selectedId, edges, nodesById),
		[selectedId, edges, nodesById]
	)

	const handleNodeClick = useCallback<NodeMouseHandler>((_, node) => onSelect(node.id), [onSelect])

	return (
		<div className="relative h-full w-full">
			<ReactFlow
				// Remount per selection so `fitView` re-frames the fresh subgraph.
				key={selectedId}
				nodes={subgraph.nodes}
				edges={subgraph.edges}
				nodeTypes={nodeTypes}
				onNodeClick={handleNodeClick}
				colorMode="dark"
				fitView
				fitViewOptions={{ padding: 0.2 }}
				nodesDraggable={false}
				nodesConnectable={false}
				minZoom={0.2}
				proOptions={{ hideAttribution: true }}
			>
				<Background gap={18} />
			</ReactFlow>
			{subgraph.nodes.length <= 1 && (
				<div className="text-muted-foreground pointer-events-none absolute inset-x-0 bottom-3 text-center text-[11px]">
					No connections
				</div>
			)}
		</div>
	)
}
