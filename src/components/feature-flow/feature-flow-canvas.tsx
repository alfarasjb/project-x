import {
	Background,
	Controls,
	MiniMap,
	Panel,
	ReactFlow,
	type Edge,
	type Node
} from "@xyflow/react"
import { FileNode } from "@/components/graph/file-node"
import { ModuleNode } from "@/components/graph/module-node"
import { SymbolNode } from "@/components/graph/symbol-node"

/**
 * Defined once at module scope — re-creating these objects per render breaks
 * ReactFlow internals (same gotcha as the main GraphCanvas).
 */
const nodeTypes = { module: ModuleNode, file: FileNode, symbol: SymbolNode }

/**
 * Lightweight ReactFlow shell used by the Feature Flows pages. Reuses the
 * project-graph node components (`module` / `file` / `symbol`) so a hand-
 * authored fixture renders with the same visual vocabulary as the parsed
 * graph — the bar set by ARG-25.
 *
 * No collapse, no filter level, no spotlight, no inspector. Those live on the
 * project-graph canvas because they make sense in that context (whole-repo
 * navigation); a feature flow is a small, curated view that doesn't need them
 * for the scaffold. Decision/branch nodes and dashed-edge styling are likewise
 * deferred to a sibling subissue.
 *
 * Both contexts the reused node components read from (`CollapseContext`,
 * `SpotlightContext`) carry safe defaults (no-op fn, null) so they render at
 * rest without providers.
 */
export function FeatureFlowCanvas({
	nodes,
	edges,
	emptyState
}: {
	nodes: Node[]
	edges: Edge[]
	/** Shown in a top-center panel when there are no nodes — e.g. "new flow". */
	emptyState?: string
}) {
	const isEmpty = nodes.length === 0

	return (
		<div className="relative h-full w-full">
			<ReactFlow
				nodes={nodes}
				edges={edges}
				nodeTypes={nodeTypes}
				colorMode="dark"
				fitView
				minZoom={0.2}
			>
				<Background gap={20} />
				<Controls />
				<MiniMap pannable zoomable />
				{isEmpty && emptyState && (
					<Panel position="top-center">
						<div className="rounded-lg border bg-card/80 px-3 py-2 text-xs text-muted-foreground backdrop-blur">
							{emptyState}
						</div>
					</Panel>
				)}
			</ReactFlow>
		</div>
	)
}
