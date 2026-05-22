import { useCallback, useMemo, useState } from "react"
import { Background, ReactFlow, type Edge, type Node, type NodeMouseHandler } from "@xyflow/react"
import type { GraphNode } from "@shared/schemas/graph"
import { InspectorGraphNode } from "./inspector-graph-node"
import { formatSignature } from "./symbol-node"

/**
 * The inspector's focused subgraph — a flat mini-graph of every node
 * edge-connected to the selected one. Deliberately *flat*: no module/file
 * containers, no nesting; the only structure is the dependency edges
 * themselves. Layered vertically by hop-distance (downstream below, upstream
 * above) so it reads as a path.
 *
 * Each node is collapsible: collapsed it's a compact pill, expanded it unfolds
 * its metadata inline. The layout is size-aware — expanding a node widens its
 * column and heightens its layer band so neighbours never overlap. Clicking a
 * node (outside its expand chevron) re-centres the inspector on it.
 */

// Defined once at module scope — re-creating breaks ReactFlow internals.
const nodeTypes = { inspector: InspectorGraphNode }

const COLLAPSED_WIDTH = 168
const EXPANDED_WIDTH = 248
const COLLAPSED_HEIGHT = 30
const NODE_GAP = 22 // horizontal gap between peers within a layer
const LAYER_GAP = 34 // vertical gap between layers

/**
 * Estimated rendered height of an expanded node. Width is fixed, so wrapping is
 * predictable enough to drive the no-overlap layout; the node clips
 * (`overflow-hidden`) if an estimate runs short, so a miss never overlaps.
 */
function estimateExpandedHeight(node: GraphNode | undefined): number {
	let height = 43 // header + divider + body vertical padding
	const path = node?.path ?? ""
	height += Math.ceil(Math.max(path.length, 1) / 34) * 14
	if (node?.signature) {
		height += 12 + Math.ceil(formatSignature(node.signature).length / 34) * 14
	}
	if (node?.description) {
		height += 4 + Math.ceil(node.description.what.length / 32) * 16
		if (node.description.why) {
			height += 4 + Math.ceil(node.description.why.length / 32) * 15
		}
	} else {
		height += 20 // "No description yet." placeholder line
	}
	return height
}

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
 * upstream negative/above). Expanded nodes claim a wider column and a taller
 * layer band; collapsed nodes stay compact. Layers and peers are centred.
 */
function buildSubgraph(
	selectedId: string,
	canvasEdges: Edge[],
	nodesById: Map<string, GraphNode>,
	expandedIds: Set<string>,
	onToggle: (id: string) => void
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
	const sortedLayers = [...byLayer.keys()].sort((a, b) => a - b)
	let cursorY = 0
	for (const l of sortedLayers) {
		const ids = byLayer.get(l) ?? []
		ids.sort((a, b) => (nodesById.get(a)?.label ?? a).localeCompare(nodesById.get(b)?.label ?? b))

		const laid = ids.map((id) => {
			const expanded = expandedIds.has(id)
			return {
				id,
				width: expanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH,
				height: expanded ? estimateExpandedHeight(nodesById.get(id)) : COLLAPSED_HEIGHT
			}
		})
		const layerHeight = Math.max(...laid.map((item) => item.height))
		const layerWidth =
			laid.reduce((sum, item) => sum + item.width, 0) + NODE_GAP * Math.max(0, laid.length - 1)

		let cursorX = -layerWidth / 2
		for (const item of laid) {
			const node = nodesById.get(item.id)
			nodes.push({
				id: item.id,
				type: "inspector",
				position: { x: cursorX, y: cursorY + (layerHeight - item.height) / 2 },
				style: { width: item.width, height: item.height },
				data: {
					label: node?.label ?? item.id,
					kind: node?.kind ?? "node",
					path: node?.path ?? item.id,
					layer: node?.layer,
					signature: node?.signature,
					description: node?.description,
					isSelected: item.id === selectedId,
					expanded: expandedIds.has(item.id),
					onToggle
				}
			})
			cursorX += item.width + NODE_GAP
		}
		cursorY += layerHeight + LAYER_GAP
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
	// Transient per-node expansion. The parent keys this component on the
	// selection, so it resets to all-collapsed whenever the inspector re-focuses.
	const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set())

	const handleToggle = useCallback((id: string) => {
		setExpandedIds((prev) => {
			const next = new Set(prev)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	}, [])

	const subgraph = useMemo(
		() => buildSubgraph(selectedId, edges, nodesById, expandedIds, handleToggle),
		[selectedId, edges, nodesById, expandedIds, handleToggle]
	)

	const handleNodeClick = useCallback<NodeMouseHandler>((_, node) => onSelect(node.id), [onSelect])

	return (
		<div className="relative h-full w-full">
			<ReactFlow
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
