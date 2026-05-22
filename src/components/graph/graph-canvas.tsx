import { useCallback, useEffect, useMemo, useState } from "react"
import {
	Background,
	Controls,
	MiniMap,
	Panel,
	ReactFlow,
	type Node,
	type NodeMouseHandler
} from "@xyflow/react"
import type { Graph, GraphNode, NodeLayer } from "@shared/schemas/graph"
import { cn } from "@/lib/utils"
import { ModuleNode } from "./module-node"
import { FileNode } from "./file-node"
import { SymbolNode } from "./symbol-node"
import { SpotlightEdge } from "./spotlight-edge"
import { CollapseContext } from "./collapse-context"
import { SpotlightContext, computeSpotlight } from "./spotlight"
import { computeNodeStats, formatNodeStats } from "./node-stats"
import { FILTER_LEVELS, computeVisible, resolveEdges, type FilterLevel } from "./detail"
import { ALL_LAYERS, LAYER_DOT } from "./node-style"
import { layoutGraph, type NodeBox } from "./layout"
import { InspectorSidebar } from "./inspector-sidebar"

// Defined once at module scope — re-creating per render breaks ReactFlow internals.
const nodeTypes = { module: ModuleNode, file: FileNode, symbol: SymbolNode }
const edgeTypes = { spotlight: SpotlightEdge }

/** Module → "module", File → "file", everything else → "symbol". */
function nodeType(kind: string): string {
	if (kind === "module") return "module"
	if (kind === "file") return "file"
	return "symbol"
}

/** Build the base ReactFlow nodes — data + structure. Layout is applied separately. */
function toFlowNodes(graph: Graph): Node[] {
	const byId = new Map(graph.nodes.map((n) => [n.id, n]))
	const parentIds = new Set(
		graph.nodes.map((n) => n.parentId).filter((id): id is string => id !== null)
	)
	const stats = computeNodeStats(graph)

	/** Nesting depth — used to order parents before children. */
	function depthOf(node: GraphNode): number {
		let depth = 0
		let current: GraphNode | undefined = node
		while (current?.parentId) {
			current = byId.get(current.parentId)
			depth++
		}
		return depth
	}

	/** Nearest layer on the node or any ancestor — files inherit their module's. */
	function effectiveLayer(node: GraphNode): NodeLayer | undefined {
		let current: GraphNode | undefined = node
		while (current) {
			if (current.layer) return current.layer
			current = current.parentId ? byId.get(current.parentId) : undefined
		}
		return undefined
	}

	function toRfNode(node: GraphNode): Node {
		const isModule = node.kind === "module"
		const stat = stats.get(node.id)
		return {
			id: node.id,
			type: nodeType(node.kind),
			position: { x: 0, y: 0 },
			parentId: node.parentId ?? undefined,
			extent: node.parentId ? "parent" : undefined,
			data: {
				label: node.label,
				kind: node.kind,
				layer: effectiveLayer(node),
				path: node.path,
				signature: node.signature,
				description: node.description,
				statsLabel: stat ? formatNodeStats(node.kind, stat) : undefined,
				...(isModule ? { collapsed: false, hasChildren: parentIds.has(node.id) } : {})
			}
		}
	}

	// ReactFlow requires a parent node to appear before its children.
	return graph.nodes
		.map((node) => ({ node, depth: depthOf(node) }))
		.sort((a, b) => a.depth - b.depth)
		.map(({ node }) => toRfNode(node))
}

/**
 * Apply a view's layout boxes to the base nodes — position, size, and the
 * `hidden` flag (a node absent from `boxes` is outside the current view).
 */
function applyLayout(
	nodes: Node[],
	boxes: Map<string, NodeBox>,
	collapsedIds: Set<string>
): Node[] {
	return nodes.map((n) => {
		const box = boxes.get(n.id)
		const next: Node = {
			...n,
			hidden: box === undefined,
			position: box ? box.position : n.position,
			...(box ? { style: { width: box.size.width, height: box.size.height } } : {})
		}
		if (n.type === "module") {
			next.data = { ...n.data, collapsed: collapsedIds.has(n.id) }
		}
		return next
	})
}

/**
 * Graph canvas. The detail filter and per-module collapse decide which nodes
 * are visible; each view is laid out fresh as a compact uniform grid.
 *
 * Edges are hidden by default — a resting canvas shows nodes only. Clicking a
 * node reveals its direct (one-hop) edges and spotlights the connected
 * subgraph; pane click or Escape clears the selection.
 *
 * Switching views re-layouts by design — the canvas does not preserve positions
 * across views; each view is its own space-conserving picture.
 */
export function GraphCanvas({ graph }: { graph: Graph }) {
	const [filterLevel, setFilterLevel] = useState<FilterLevel>("files")
	const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set())
	const [selectedId, setSelectedId] = useState<string | null>(null)
	const [inspectorOpen, setInspectorOpen] = useState(false)

	const baseNodes = useMemo(() => toFlowNodes(graph), [graph])

	const visible = useMemo(
		() => computeVisible(graph, filterLevel, collapsedIds),
		[graph, filterLevel, collapsedIds]
	)
	const boxes = useMemo(() => layoutGraph(graph, visible), [graph, visible])
	const nodes = useMemo(
		() => applyLayout(baseNodes, boxes, collapsedIds),
		[baseNodes, boxes, collapsedIds]
	)
	const edges = useMemo(() => resolveEdges(graph, visible), [graph, visible])

	// Edges are hidden until a node is selected — then only its direct (one-hop)
	// connections render, keeping the resting canvas free of edge clutter.
	const visibleEdges = useMemo(() => {
		if (selectedId === null) return []
		return edges.filter((edge) => edge.source === selectedId || edge.target === selectedId)
	}, [edges, selectedId])

	const spotlight = useMemo(
		() => computeSpotlight(graph.nodes, edges, selectedId),
		[graph, edges, selectedId]
	)

	// Drop the selection if the current view hides the selected node.
	useEffect(() => {
		if (selectedId !== null && !visible.has(selectedId)) setSelectedId(null)
	}, [visible, selectedId])

	const toggleCollapse = useCallback((moduleId: string) => {
		setCollapsedIds((prev) => {
			const next = new Set(prev)
			if (next.has(moduleId)) next.delete(moduleId)
			else next.add(moduleId)
			return next
		})
	}, [])

	const collapseAll = useCallback(() => {
		setCollapsedIds(new Set(graph.nodes.filter((n) => n.kind === "module").map((n) => n.id)))
	}, [graph])

	const expandAll = useCallback(() => {
		setCollapsedIds(new Set())
	}, [])

	const handleNodeClick = useCallback<NodeMouseHandler>((_, node) => {
		setSelectedId(node.id)
		setInspectorOpen(true)
	}, [])

	const clearSelection = useCallback(() => {
		setSelectedId(null)
	}, [])

	const toggleInspector = useCallback(() => {
		setInspectorOpen((open) => !open)
	}, [])

	// Escape clears the spotlight, same as a pane click.
	useEffect(() => {
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") setSelectedId(null)
		}
		window.addEventListener("keydown", onKey)
		return () => {
			window.removeEventListener("keydown", onKey)
		}
	}, [])

	return (
		<div className="flex h-full w-full">
			<div className="relative h-full flex-1">
				<SpotlightContext.Provider value={spotlight}>
					<CollapseContext.Provider value={toggleCollapse}>
						<ReactFlow
							// Remount on view change so `fitView` re-frames the fresh
							// layout; collapse keeps the key and re-packs in place.
							key={filterLevel}
							nodes={nodes}
							edges={visibleEdges}
							onNodeClick={handleNodeClick}
							onPaneClick={clearSelection}
							nodeTypes={nodeTypes}
							edgeTypes={edgeTypes}
							colorMode="dark"
							fitView
							minZoom={0.2}
						>
							<Background gap={20} />
							<Controls />
							<MiniMap pannable zoomable />
							<Panel position="top-center">
								<div className="flex items-center gap-2">
									<div className="flex gap-0.5 rounded-lg border bg-card/80 p-0.5 backdrop-blur">
										{FILTER_LEVELS.map((level) => (
											<button
												key={level.value}
												type="button"
												onClick={() => setFilterLevel(level.value)}
												aria-pressed={filterLevel === level.value}
												className={cn(
													"rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
													filterLevel === level.value
														? "bg-primary text-primary-foreground"
														: "text-muted-foreground hover:text-foreground"
												)}
											>
												{level.label}
											</button>
										))}
									</div>
									<div className="flex gap-0.5 rounded-lg border bg-card/80 p-0.5 backdrop-blur">
										{[
											{ label: "Expand all", onClick: expandAll },
											{ label: "Collapse all", onClick: collapseAll }
										].map((action) => (
											<button
												key={action.label}
												type="button"
												onClick={action.onClick}
												className="rounded-md px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
											>
												{action.label}
											</button>
										))}
									</div>
								</div>
							</Panel>
							<Panel position="top-right">
								<div className="rounded-lg border bg-card/80 px-3 py-2.5 text-xs backdrop-blur">
									<div className="font-display font-semibold">Project X · graph</div>
									<div className="text-muted-foreground">
										{graph.nodes.length} nodes · {graph.edges.length} edges
									</div>
									<div className="mt-2 flex flex-col gap-1">
										{ALL_LAYERS.map((layer) => (
											<div key={layer} className="flex items-center gap-1.5">
												<span className={cn("size-2 rounded-sm", LAYER_DOT[layer])} />
												<span className="text-muted-foreground">{layer}</span>
											</div>
										))}
									</div>
								</div>
							</Panel>
						</ReactFlow>
					</CollapseContext.Provider>
				</SpotlightContext.Provider>
			</div>
			<InspectorSidebar
				graph={graph}
				edges={edges}
				selectedId={selectedId}
				open={inspectorOpen}
				onToggle={toggleInspector}
				onSelect={setSelectedId}
			/>
		</div>
	)
}
