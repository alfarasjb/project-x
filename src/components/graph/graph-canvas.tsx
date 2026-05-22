import { useCallback, useEffect, useMemo, useState } from "react"
import {
	Background,
	Controls,
	MiniMap,
	Panel,
	ReactFlow,
	useEdgesState,
	useNodesState,
	type Edge,
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
import { ALL_LAYERS, LAYER_DOT } from "./node-style"
import { layoutGraph } from "./layout"

// Defined once at module scope — re-creating per render breaks ReactFlow internals.
const nodeTypes = { module: ModuleNode, file: FileNode, symbol: SymbolNode }
const edgeTypes = { spotlight: SpotlightEdge }

/** Height a module shrinks to when collapsed — fits its header + description. */
const COLLAPSED_HEIGHT = 80

/** Module → "module", File → "file", everything else → "symbol". */
function nodeType(kind: string): string {
	if (kind === "module") return "module"
	if (kind === "file") return "file"
	return "symbol"
}

/**
 * Node ids hidden under a collapsed module: a node is hidden when *any* of its
 * ancestors is collapsed. Walking the full ancestor chain (not just the direct
 * parent) is what makes nested collapse correct — expanding a module keeps a
 * still-collapsed child's contents hidden.
 */
function hiddenNodeIds(graph: Graph, collapsedIds: Set<string>): Set<string> {
	const byId = new Map(graph.nodes.map((n) => [n.id, n]))
	const hidden = new Set<string>()
	for (const node of graph.nodes) {
		let current = node.parentId ? byId.get(node.parentId) : undefined
		while (current) {
			if (collapsedIds.has(current.id)) {
				hidden.add(node.id)
				break
			}
			current = current.parentId ? byId.get(current.parentId) : undefined
		}
	}
	return hidden
}

function toFlowNodes(graph: Graph): Node[] {
	const byId = new Map(graph.nodes.map((n) => [n.id, n]))
	const parentIds = new Set(
		graph.nodes.map((n) => n.parentId).filter((id): id is string => id !== null)
	)

	// Modules start collapsed — the canvas opens on a tidy set of top-level boxes.
	const collapsedIds = new Set(
		graph.nodes.filter((n) => n.kind === "module").map((n) => n.id)
	)
	const hidden = hiddenNodeIds(graph, collapsedIds)
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
			position: node.position ?? { x: 0, y: 0 },
			parentId: node.parentId ?? undefined,
			extent: node.parentId ? "parent" : undefined,
			hidden: hidden.has(node.id),
			...(node.size
				? {
						style: {
							width: node.size.width,
							height: isModule ? COLLAPSED_HEIGHT : node.size.height
						}
					}
				: {}),
			data: {
				label: node.label,
				kind: node.kind,
				layer: effectiveLayer(node),
				path: node.path,
				signature: node.signature,
				description: node.description,
				statsLabel: stat ? formatNodeStats(node.kind, stat) : undefined,
				...(isModule
					? {
							collapsed: true,
							fullHeight: node.size?.height,
							hasChildren: parentIds.has(node.id)
						}
					: {})
			}
		}
	}

	// ReactFlow requires a parent node to appear before its children.
	return graph.nodes
		.map((node) => ({ node, depth: depthOf(node) }))
		.sort((a, b) => a.depth - b.depth)
		.map(({ node }) => toRfNode(node))
}

function toFlowEdges(graph: Graph): Edge[] {
	// File-tier edges only: the parser's rolled-up module→module edges are
	// redundant with the file edges beneath them and just clutter the canvas.
	const kindById = new Map(graph.nodes.map((n) => [n.id, n.kind]))
	return graph.edges
		.filter(
			(edge) =>
				kindById.get(edge.source) !== "module" && kindById.get(edge.target) !== "module"
		)
		.map<Edge>((edge) => ({
			id: edge.id,
			source: edge.source,
			target: edge.target,
			type: "spotlight"
		}))
}

/**
 * Re-derive `hidden` and collapse state across all flow nodes for a target set
 * of collapsed module ids. Shared by the per-module toggle and the expand /
 * collapse-all controls.
 */
function applyCollapsedState(nodes: Node[], collapsedIds: Set<string>, graph: Graph): Node[] {
	const hidden = hiddenNodeIds(graph, collapsedIds)
	return nodes.map((n) => {
		const next: Node = { ...n, hidden: hidden.has(n.id) }
		if (n.type === "module") {
			const collapsed = collapsedIds.has(n.id)
			const fullHeight =
				typeof n.data.fullHeight === "number" ? n.data.fullHeight : undefined
			next.data = { ...n.data, collapsed }
			next.style = { ...n.style, height: collapsed ? COLLAPSED_HEIGHT : fullHeight }
		}
		return next
	})
}

/**
 * Graph canvas. Lays out the parsed graph and renders it with every module
 * collapsed — the canvas opens on the top-level boxes and the user expands in.
 * Clicking a node spotlights its connected subgraph (see `spotlight.ts`);
 * clicking the pane or pressing Escape clears it.
 *
 * Note: `toFlowNodes` runs once via `useNodesState`'s initializer. A later
 * change to the `graph` prop (a re-parse) won't reflow on its own — wire that
 * when the file watcher lands.
 */
export function GraphCanvas({ graph }: { graph: Graph }) {
	const laidOut = useMemo(() => layoutGraph(graph), [graph])
	const [nodes, setNodes, onNodesChange] = useNodesState(toFlowNodes(laidOut))
	const [edges, , onEdgesChange] = useEdgesState(toFlowEdges(laidOut))
	const [selectedId, setSelectedId] = useState<string | null>(null)

	// Pure + memoized: `laidOut` and `edges` are stable, so this recomputes only
	// when the selection changes — not on every render or collapse toggle.
	const spotlight = useMemo(
		() => computeSpotlight(laidOut.nodes, edges, selectedId),
		[laidOut, edges, selectedId]
	)

	const toggleCollapse = useCallback(
		(moduleId: string) => {
			setNodes((current) => {
				// Rebuild the collapsed set with the toggled module flipped.
				const collapsed = new Set<string>()
				for (const n of current) {
					if (n.type !== "module") continue
					const isCollapsed =
						n.id === moduleId ? !n.data.collapsed : Boolean(n.data.collapsed)
					if (isCollapsed) collapsed.add(n.id)
				}
				return applyCollapsedState(current, collapsed, laidOut)
			})
		},
		[laidOut, setNodes]
	)

	const collapseAll = useCallback(() => {
		setNodes((current) => {
			const everyModule = new Set(
				current.filter((n) => n.type === "module").map((n) => n.id)
			)
			return applyCollapsedState(current, everyModule, laidOut)
		})
	}, [laidOut, setNodes])

	const expandAll = useCallback(() => {
		setNodes((current) => applyCollapsedState(current, new Set(), laidOut))
	}, [laidOut, setNodes])

	const handleNodeClick = useCallback<NodeMouseHandler>((_, node) => {
		setSelectedId(node.id)
	}, [])

	const clearSelection = useCallback(() => {
		setSelectedId(null)
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
		<div className="h-full w-full">
			<SpotlightContext.Provider value={spotlight}>
				<CollapseContext.Provider value={toggleCollapse}>
					<ReactFlow
						nodes={nodes}
						edges={edges}
						onNodesChange={onNodesChange}
						onEdgesChange={onEdgesChange}
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
						</Panel>
						<Panel position="top-left">
							<div className="rounded-lg border bg-card/80 px-3 py-2.5 text-xs backdrop-blur">
								<div className="font-display font-semibold">Project X · graph</div>
								<div className="text-muted-foreground">
									{laidOut.nodes.length} nodes · {laidOut.edges.length} edges
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
	)
}
