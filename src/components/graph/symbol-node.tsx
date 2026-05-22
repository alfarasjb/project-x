import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import type { Description, Signature } from "@shared/schemas/graph"
import { cn } from "@/lib/utils"
import { DEFAULT_DOT, KIND_DOT } from "./node-style"
import { SpotlightOverlay } from "./spotlight-overlay"
import { useNodeSpotlight } from "./spotlight"

export interface SymbolNodeData {
	label: string
	kind: string
	path: string
	signature?: Signature
	description?: Description
	[key: string]: unknown
}

export type SymbolNodeType = Node<SymbolNodeData, "symbol">

/** Format a signature compactly: `(name: Type, …) → ReturnType`. */
function formatSignature(sig: Signature): string {
	const params = sig.parameters
		.map((p) => (p.type ? `${p.name}: ${p.type.name}` : p.name))
		.join(", ")
	const ret = sig.returnType ? ` → ${sig.returnType.name}` : ""
	return `(${params})${ret}`
}

/** A leaf node — a function, class, constant, type, or other symbol. */
export function SymbolNode({ id, data }: NodeProps<SymbolNodeType>) {
	const role = useNodeSpotlight(id)
	const tooltip = data.description
		? data.description.why
			? `${data.description.what}\n\nWhy: ${data.description.why}`
			: data.description.what
		: data.path

	return (
		<div
			className={cn(
				"relative flex h-full w-full flex-col gap-0.5 overflow-hidden rounded-md border bg-card px-2.5 py-1.5 shadow-sm transition-opacity duration-200",
				role === "dimmed" && "opacity-40"
			)}
			title={tooltip}
		>
			<SpotlightOverlay role={role} />
			<Handle type="target" position={Position.Left} />
			<div className="flex items-center gap-2">
				<span
					className={cn(
						"size-1.5 shrink-0 rounded-full",
						KIND_DOT[data.kind] ?? DEFAULT_DOT
					)}
				/>
				<span className="truncate text-xs font-medium">{data.label}</span>
				<span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
					{data.kind}
				</span>
			</div>
			{data.signature && (
				<div className="truncate font-mono text-[10px] leading-snug text-muted-foreground">
					{formatSignature(data.signature)}
				</div>
			)}
			{!data.signature && data.description && (
				<div className="truncate text-[10px] leading-snug text-muted-foreground">
					{data.description.what}
				</div>
			)}
			<Handle type="source" position={Position.Right} />
		</div>
	)
}
