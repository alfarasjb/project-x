import { useCallback } from "react"
import {
	Background,
	Controls,
	MiniMap,
	Panel,
	ReactFlow,
	useEdgesState,
	useNodesState,
	type Edge,
	type Node
} from "@xyflow/react"
import type { Graph, GraphNode } from "@shared/schemas/graph"
import { cn } from "@/lib/utils"
import { ModuleNode } from "./module-node"
import { FileNode } from "./file-node"
import { SymbolNode } from "./symbol-node"
import { CollapseContext } from "./collapse-context"
import { ALL_LAYERS, LAYER_DOT } from "./node-style"

// Defined once at module scope — re-creating per render breaks ReactFlow internals.
const nodeTypes = { module: ModuleNode, file: FileNode, symbol: SymbolNode }

/** Height a module shrinks to when collapsed — fits its header + description. */
const COLLAPSED_HEIGHT = 80

/** Module → "module", File → "file", everything else → "symbol". */
function nodeType(kind: string): string {
	if (kind === "module") return "module"
	if (kind === "file") return "file"
	return "symbol"
}

function toFlowNodes(graph: Graph): Node[] {
	const byId = new Map(graph.nodes.map((n) => [n.id, n]))

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

	function toRfNode(node: GraphNode): Node {
		return {
			id: node.id,
			type: nodeType(node.kind),
			position: node.position,
			parentId: node.parentId ?? undefined,
			extent: node.parentId ? "parent" : undefined,
			...(node.size ? { style: { width: node.size.width, height: node.size.height } } : {}),
			data: {
				label: node.label,
				kind: node.kind,
				layer: node.layer,
				path: node.path,
				signature: node.signature,
				description: node.description,
				...(node.kind === "module"
					? { collapsed: false, fullHeight: node.size?.height }
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
	return graph.edges.map<Edge>((edge) => ({
		id: edge.id,
		source: edge.source,
		target: edge.target,
		label: edge.kind === "dependency" ? undefined : edge.kind,
		animated: edge.kind === "data-flow"
	}))
}

/** Every node id nested anywhere under `rootId` (files + their primitives). */
function descendantIds(graph: Graph, rootId: string): Set<string> {
	const childrenOf = new Map<string, string[]>()
	for (const node of graph.nodes) {
		if (!node.parentId) continue
		const siblings = childrenOf.get(node.parentId) ?? []
		siblings.push(node.id)
		childrenOf.set(node.parentId, siblings)
	}

	const result = new Set<string>()
	const stack = [rootId]
	while (stack.length > 0) {
		const current = stack.pop()
		if (current === undefined) continue
		for (const child of childrenOf.get(current) ?? []) {
			result.add(child)
			stack.push(child)
		}
	}
	return result
}

export function GraphCanvas({ graph }: { graph: Graph }) {
	const [nodes, setNodes, onNodesChange] = useNodesState(toFlowNodes(graph))
	const [edges, , onEdgesChange] = useEdgesState(toFlowEdges(graph))

	const toggleCollapse = useCallback(
		(moduleId: string) => {
			setNodes((current) => {
				const target = current.find((n) => n.id === moduleId)
				if (!target) return current
				const nextCollapsed = !target.data.collapsed
				const descendants = descendantIds(graph, moduleId)

				return current.map((n) => {
					if (n.id === moduleId) {
						const fullHeight =
							typeof n.data.fullHeight === "number" ? n.data.fullHeight : undefined
						return {
							...n,
							data: { ...n.data, collapsed: nextCollapsed },
							style: {
								...n.style,
								height: nextCollapsed ? COLLAPSED_HEIGHT : fullHeight
							}
						}
					}
					if (descendants.has(n.id)) return { ...n, hidden: nextCollapsed }
					return n
				})
			})
		},
		[graph, setNodes]
	)

	return (
		<div className="h-full w-full">
			<CollapseContext.Provider value={toggleCollapse}>
				<ReactFlow
					nodes={nodes}
					edges={edges}
					onNodesChange={onNodesChange}
					onEdgesChange={onEdgesChange}
					nodeTypes={nodeTypes}
					colorMode="dark"
					fitView
					minZoom={0.2}
				>
					<Background gap={20} />
					<Controls />
					<MiniMap pannable zoomable />
					<Panel position="top-left">
						<div className="rounded-lg border bg-card/80 px-3 py-2.5 text-xs backdrop-blur">
							<div className="font-display font-semibold">Project X · graph (seed)</div>
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
		</div>
	)
}
