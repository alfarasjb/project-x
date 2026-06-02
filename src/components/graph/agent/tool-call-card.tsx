import { useState } from "react"
import { Check, ChevronDown, Loader2, TriangleAlert } from "lucide-react"
import type { ToolCall, ToolCallStatus } from "./types"
import { cn } from "@/lib/utils"

/** Status glyph: spinner while running, alert on error, check when done. */
function StatusIcon({ status }: { status: ToolCallStatus }) {
	if (status === "running") {
		return <Loader2 className="text-muted-foreground size-3 animate-spin" />
	}
	if (status === "error") {
		return <TriangleAlert className="text-destructive size-3" />
	}
	return <Check className="text-foreground size-3" />
}

/**
 * A single tool invocation inside an assistant turn: name + summarized args +
 * status, expandable to its result (or error) once the call resolves.
 */
export function ToolCallCard({ toolCall }: { toolCall: ToolCall }) {
	// Default open so a resolved call shows its result without a click; inert
	// (the toggle is disabled) until `hasDetail` is true.
	const [open, setOpen] = useState(true)
	const hasDetail = toolCall.resultSummary !== undefined || toolCall.error !== undefined

	return (
		<div className="bg-muted/50 w-fit max-w-full rounded-md border text-xs">
			<button
				type="button"
				onClick={() => setOpen((value) => !value)}
				disabled={!hasDetail}
				className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left disabled:cursor-default"
			>
				<StatusIcon status={toolCall.status} />
				<span className="font-mono font-medium">{toolCall.name}</span>
				<span className="text-muted-foreground truncate font-mono">{toolCall.argsSummary}</span>
				{hasDetail && (
					<ChevronDown
						className={cn(
							"text-muted-foreground ml-auto size-3 shrink-0 transition-transform",
							open && "rotate-180"
						)}
					/>
				)}
			</button>
			{hasDetail && open && (
				<div className="border-t px-2 py-1.5 font-mono">
					{toolCall.error !== undefined ? (
						<span className="text-destructive">{toolCall.error}</span>
					) : (
						<span className="text-muted-foreground">{toolCall.resultSummary}</span>
					)}
				</div>
			)}
		</div>
	)
}
