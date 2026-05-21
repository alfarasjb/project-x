import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { cn } from "@/lib/utils"

export interface FileNodeData {
	label: string
	path: string
	[key: string]: unknown
}

export type FileNodeType = Node<FileNodeData, "file">

/** A container node — a source file, sitting between a module and its primitives. */
export function FileNode({ data, selected }: NodeProps<FileNodeType>) {
	return (
		<div
			className={cn(
				"flex h-full w-full flex-col rounded-lg border border-dashed border-border bg-muted/20",
				selected && "ring-2 ring-ring"
			)}
			title={data.path}
		>
			<Handle type="target" position={Position.Top} />
			<div className="border-b border-dashed border-inherit px-2.5 py-1.5">
				<span className="font-mono text-[11px] text-muted-foreground">{data.label}</span>
			</div>
			<Handle type="source" position={Position.Bottom} />
		</div>
	)
}
