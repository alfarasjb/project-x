import { useContext } from "react"
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { ChevronDown, ChevronRight } from "lucide-react"
import type { Description, NodeLayer } from "@shared/schemas/graph"
import { cn } from "@/lib/utils"
import { CollapseContext } from "./collapse-context"
import { LAYER_BADGE, LAYER_BORDER } from "./node-style"

export interface ModuleNodeData {
	label: string
	layer?: NodeLayer
	path: string
	description?: Description
	/** True while the module's children are hidden. */
	collapsed?: boolean
	/** Expanded height — restored when the module is re-expanded. */
	fullHeight?: number
	[key: string]: unknown
}

export type ModuleNodeType = Node<ModuleNodeData, "module">

/** A container node — a module/folder that may hold child file nodes. Collapsible. */
export function ModuleNode({ id, data, selected }: NodeProps<ModuleNodeType>) {
	const toggleCollapse = useContext(CollapseContext)
	const border = data.layer ? LAYER_BORDER[data.layer] : "border-border"

	return (
		<div
			className={cn(
				"flex h-full w-full flex-col rounded-xl border bg-card/30 backdrop-blur-sm",
				border,
				selected && "ring-2 ring-ring"
			)}
		>
			<Handle type="target" position={Position.Top} />
			<div className="flex items-center gap-1.5 border-b border-inherit px-2.5 py-2">
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
				<span className="font-display text-xs font-semibold uppercase tracking-wide">
					{data.label}
				</span>
				{data.layer && (
					<span
						className={cn(
							"ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium",
							LAYER_BADGE[data.layer]
						)}
					>
						{data.layer}
					</span>
				)}
			</div>
			{data.description && (
				<p className="px-3 pt-1.5 text-[10px] leading-snug text-muted-foreground">
					{data.description.what}
				</p>
			)}
			<Handle type="source" position={Position.Bottom} />
		</div>
	)
}
