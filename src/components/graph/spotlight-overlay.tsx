import { cn } from "@/lib/utils"
import type { NodeSpotlightRole } from "./spotlight"

/**
 * The spotlight layer for a node — a colour tint for upstream / downstream
 * membership and a ring for the selected node. Drawn as a separate inset
 * element so it never fights the node's own border, and always mounted so role
 * changes cross-fade rather than pop.
 *
 * The host node must be `relative` for the `inset-0` positioning to land.
 */
export function SpotlightOverlay({ role }: { role: NodeSpotlightRole }) {
	return (
		<div
			className={cn(
				"pointer-events-none absolute inset-0 z-10 rounded-[inherit] transition-all duration-200",
				role === "selected" && "ring-2 ring-foreground",
				role === "upstream" && "bg-sky-500/20",
				role === "downstream" && "bg-amber-500/20"
			)}
		/>
	)
}
