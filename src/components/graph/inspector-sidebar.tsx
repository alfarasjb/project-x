import { useMemo } from "react"
import type { Edge } from "@xyflow/react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import type { Graph } from "@shared/schemas/graph"
import { InspectorSubgraph } from "./inspector-subgraph"
import { InspectorNodeInfo } from "./inspector-node-info"

/**
 * Collapsible right-hand inspector. When a node is selected it shows that
 * node's detail plus a flat mini-graph of everything edge-connected to it — an
 * on-demand, distilled alternative to hunting connected nodes across the
 * sprawling canvas.
 *
 * Collapsed, it's a thin rail; the selection lives in `GraphCanvas`, so
 * collapsing never loses what's selected.
 */
export function InspectorSidebar({
	graph,
	edges,
	selectedId,
	open,
	onToggle,
	onSelect
}: {
	graph: Graph
	edges: Edge[]
	selectedId: string | null
	open: boolean
	onToggle: () => void
	onSelect: (id: string) => void
}) {
	const nodesById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph])

	if (!open) {
		return (
			<div className="bg-card flex h-full w-10 shrink-0 flex-col items-center border-l py-3">
				<button
					type="button"
					onClick={onToggle}
					title="Open inspector"
					className="text-muted-foreground hover:text-foreground rounded-md p-1.5 transition-colors"
				>
					<ChevronLeft className="h-4 w-4" />
				</button>
			</div>
		)
	}

	const selectedNode = selectedId === null ? undefined : nodesById.get(selectedId)

	return (
		<aside className="bg-card flex h-full w-80 shrink-0 flex-col border-l">
			<div className="flex items-center justify-between border-b px-3 py-2">
				<span className="font-display text-sm font-semibold">Inspector</span>
				<button
					type="button"
					onClick={onToggle}
					title="Collapse inspector"
					className="text-muted-foreground hover:text-foreground rounded-md p-1 transition-colors"
				>
					<ChevronRight className="h-4 w-4" />
				</button>
			</div>
			{selectedNode ? (
				<>
					<div className="max-h-[45%] shrink-0 overflow-y-auto border-b p-3">
						<InspectorNodeInfo node={selectedNode} />
					</div>
					<div className="min-h-0 flex-1">
						<InspectorSubgraph
							selectedId={selectedNode.id}
							nodesById={nodesById}
							edges={edges}
							onSelect={onSelect}
						/>
					</div>
				</>
			) : (
				<p className="text-muted-foreground p-3 text-sm">
					Select a node on the canvas to inspect it.
				</p>
			)}
		</aside>
	)
}
