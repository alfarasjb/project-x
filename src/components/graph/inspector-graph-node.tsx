import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { cn } from "@/lib/utils"
import { DEFAULT_DOT, KIND_DOT } from "./node-style"

export interface InspectorNodeData {
	label: string
	kind: string
	isSelected: boolean
	[key: string]: unknown
}

export type InspectorGraphNodeType = Node<InspectorNodeData, "inspector">

/**
 * A node in the inspector's flat mini-graph. Compact, with top/bottom handles
 * so edges flow vertically. No containment, no nesting — every node is a peer.
 */
export function InspectorGraphNode({ data }: NodeProps<InspectorGraphNodeType>) {
	return (
		<div
			className={cn(
				"flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 shadow-sm",
				data.isSelected && "border-primary ring-primary/40 ring-1"
			)}
		>
			<Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !border-0" />
			<span className={cn("size-1.5 shrink-0 rounded-full", KIND_DOT[data.kind] ?? DEFAULT_DOT)} />
			<span className="max-w-[140px] truncate text-[11px] font-medium">{data.label}</span>
			<Handle type="source" position={Position.Bottom} className="!h-1.5 !w-1.5 !border-0" />
		</div>
	)
}
