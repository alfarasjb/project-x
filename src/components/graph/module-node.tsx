import { useContext } from "react"
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { ChevronDown, ChevronRight } from "lucide-react"
import type { NodeLayer } from "@shared/schemas/graph"
import { cn } from "@/lib/utils"
import { CollapseContext } from "./collapse-context"
import { LAYER_BADGE, LAYER_BG, LAYER_BORDER, LAYER_HEADER } from "./node-style"
import { SpotlightOverlay } from "./spotlight-overlay"
import { useNodeSpotlight } from "./spotlight"

export interface ModuleNodeData {
	label: string
	layer?: NodeLayer
	path: string
	/** True while the module's children are hidden. */
	collapsed?: boolean
	/** Whether the module has visible children — false hides the collapse control. */
	hasChildren?: boolean
	/** Compact subtree summary shown in the header, e.g. "5 files · 8 edges". */
	statsLabel?: string
	[key: string]: unknown
}

export type ModuleNodeType = Node<ModuleNodeData, "module">

/** A container node — a module/folder that may hold child file nodes. Collapsible. */
export function ModuleNode({ id, data }: NodeProps<ModuleNodeType>) {
	const toggleCollapse = useContext(CollapseContext)
	const role = useNodeSpotlight(id)
	const border = data.layer ? LAYER_BORDER[data.layer] : "border-border"
	const bg = data.layer ? LAYER_BG[data.layer] : "bg-card/30"
	const header = data.layer ? LAYER_HEADER[data.layer] : "bg-muted/30"

	return (
		<div
			className={cn(
				"relative flex h-full w-full flex-col rounded-xl border backdrop-blur-sm transition-opacity duration-200",
				border,
				bg,
				role === "dimmed" && "opacity-40"
			)}
		>
			<SpotlightOverlay role={role} />
			<Handle type="target" position={Position.Left} />
			<div className={cn("flex items-center gap-1.5 border-b border-inherit px-2.5 py-2", header)}>
				{data.hasChildren && (
					<button
						type="button"
						className="nodrag flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
						onClick={(e) => {
							e.stopPropagation()
							toggleCollapse(id)
						}}
						aria-label={data.collapsed ? "Expand module" : "Collapse module"}
					>
						{data.collapsed ? (
							<ChevronRight className="size-3.5" />
						) : (
							<ChevronDown className="size-3.5" />
						)}
					</button>
				)}
				<span className="min-w-0 truncate font-display text-xs font-semibold uppercase tracking-wide">
					{data.label}
				</span>
				{data.statsLabel && (
					<span className="ml-auto whitespace-nowrap text-[10px] font-normal text-muted-foreground">
						{data.statsLabel}
					</span>
				)}
				{data.layer && (
					<span
						className={cn(
							"shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium",
							!data.statsLabel && "ml-auto",
							LAYER_BADGE[data.layer]
						)}
					>
						{data.layer}
					</span>
				)}
			</div>
			<Handle type="source" position={Position.Right} />
		</div>
	)
}
