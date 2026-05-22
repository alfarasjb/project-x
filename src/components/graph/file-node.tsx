import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import type { NodeLayer } from "@shared/schemas/graph"
import { cn } from "@/lib/utils"
import { LAYER_BG, LAYER_BORDER } from "./node-style"
import { SpotlightOverlay } from "./spotlight-overlay"
import { useNodeSpotlight } from "./spotlight"

export interface FileNodeData {
	label: string
	path: string
	/** Layer inherited from the containing module — drives the file's tint. */
	layer?: NodeLayer
	/** Compact subtree summary shown in the header, e.g. "8 defs". */
	statsLabel?: string
	[key: string]: unknown
}

export type FileNodeType = Node<FileNodeData, "file">

/** A container node — a source file, sitting between a module and its primitives. */
export function FileNode({ id, data }: NodeProps<FileNodeType>) {
	const role = useNodeSpotlight(id)
	const border = data.layer ? LAYER_BORDER[data.layer] : "border-border"
	const bg = data.layer ? LAYER_BG[data.layer] : "bg-muted/20"

	return (
		<div
			className={cn(
				"relative flex h-full w-full flex-col rounded-lg border border-dashed transition-opacity duration-200",
				border,
				bg,
				role === "dimmed" && "opacity-40"
			)}
			title={data.path}
		>
			<SpotlightOverlay role={role} />
			<Handle type="target" position={Position.Top} />
			<div className="flex items-center gap-2 border-b border-dashed border-inherit px-2.5 py-1.5">
				<span className="truncate font-mono text-[11px] text-muted-foreground">
					{data.label}
				</span>
				{data.statsLabel && (
					<span className="ml-auto shrink-0 text-[10px] text-muted-foreground/70">
						{data.statsLabel}
					</span>
				)}
			</div>
			<Handle type="source" position={Position.Bottom} />
		</div>
	)
}
