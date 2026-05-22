import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { ChevronDown, ChevronRight } from "lucide-react"
import type { Description, NodeLayer, Signature } from "@shared/schemas/graph"
import { cn } from "@/lib/utils"
import { DEFAULT_DOT, KIND_DOT, LAYER_BADGE } from "./node-style"
import { formatSignature } from "./symbol-node"

export interface InspectorNodeData {
	label: string
	kind: string
	/** Language-agnostic identity — always present. */
	path: string
	/** Architectural tier — modules carry it; symbols usually omit it. */
	layer?: NodeLayer
	/** Callable signature — function/method nodes only. */
	signature?: Signature
	/** Docstring — absent until the AI describe pipeline exists. */
	description?: Description
	isSelected: boolean
	expanded: boolean
	onToggle: (id: string) => void
	[key: string]: unknown
}

export type InspectorGraphNodeType = Node<InspectorNodeData, "inspector">

/**
 * A node in the inspector's flat mini-graph. Collapsed it's a compact pill —
 * kind dot, label, layer badge, kind tag. Expanded it unfolds its metadata
 * inline (path, signature, description) so peers can be read without
 * re-centring the inspector. Top/bottom handles keep edges flowing vertically.
 */
export function InspectorGraphNode({ id, data }: NodeProps<InspectorGraphNodeType>) {
	return (
		<div
			className={cn(
				"bg-card flex h-full w-full flex-col overflow-hidden rounded-md border shadow-sm",
				data.isSelected && "border-primary ring-primary/40 ring-1"
			)}
		>
			<Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !border-0" />

			<div className="flex items-center gap-1.5 px-2 py-1">
				<span
					className={cn("size-1.5 shrink-0 rounded-full", KIND_DOT[data.kind] ?? DEFAULT_DOT)}
				/>
				<span className="min-w-0 flex-1 truncate text-[11px] font-medium">{data.label}</span>
				{data.layer && (
					<span
						className={cn("shrink-0 rounded px-1 text-[9px] font-medium", LAYER_BADGE[data.layer])}
					>
						{data.layer}
					</span>
				)}
				<span className="text-muted-foreground shrink-0 font-mono text-[9px]">{data.kind}</span>
				<button
					type="button"
					onClick={(event) => {
						event.stopPropagation()
						data.onToggle(id)
					}}
					title={data.expanded ? "Collapse" : "Expand"}
					className="text-muted-foreground hover:text-foreground shrink-0 rounded transition-colors"
				>
					{data.expanded ? (
						<ChevronDown className="h-3 w-3" />
					) : (
						<ChevronRight className="h-3 w-3" />
					)}
				</button>
			</div>

			{data.expanded && (
				<div className="flex flex-col gap-1 border-t px-2 py-1.5">
					<p className="text-muted-foreground break-all font-mono text-[10px] leading-snug">
						{data.path}
					</p>
					{data.signature && (
						<div className="bg-muted/50 rounded px-1.5 py-1 font-mono text-[10px] leading-snug">
							{formatSignature(data.signature)}
						</div>
					)}
					{data.description ? (
						<>
							<p className="text-[11px] leading-snug">{data.description.what}</p>
							{data.description.why && (
								<p className="text-muted-foreground text-[10px] italic leading-snug">
									{data.description.why}
								</p>
							)}
						</>
					) : (
						<p className="text-muted-foreground text-[10px] italic">No description yet.</p>
					)}
				</div>
			)}

			<Handle type="source" position={Position.Bottom} className="!h-1.5 !w-1.5 !border-0" />
		</div>
	)
}
