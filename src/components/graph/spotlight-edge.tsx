import type { CSSProperties } from "react"
import { BaseEdge, getSmoothStepPath, type EdgeProps } from "@xyflow/react"
import { cn } from "@/lib/utils"
import { useEdgeSpotlight, type EdgeSpotlightRole } from "./spotlight"

/** Stroke colour per spotlight role — muted edges keep the idle colour, dimmed via opacity. */
const STROKE: Record<EdgeSpotlightRole, string> = {
	idle: "var(--graph-edge-idle)",
	upstream: "var(--graph-edge-upstream)",
	downstream: "var(--graph-edge-downstream)",
	muted: "var(--graph-edge-idle)"
}

/**
 * The default edge — orthogonal smooth-step routing, styled by its spotlight
 * role. Calm by default (thin, low-contrast grey); upstream / downstream edges
 * thicken, take their colour, and flow via the `graph-edge-flow` dash animation.
 */
export function SpotlightEdge({
	id,
	sourceX,
	sourceY,
	targetX,
	targetY,
	sourcePosition,
	targetPosition
}: EdgeProps) {
	const [path] = getSmoothStepPath({
		sourceX,
		sourceY,
		targetX,
		targetY,
		sourcePosition,
		targetPosition,
		borderRadius: 8
	})
	const role = useEdgeSpotlight(id)
	const flowing = role === "upstream" || role === "downstream"

	const style: CSSProperties = {
		stroke: STROKE[role],
		strokeWidth: flowing ? 2 : 1,
		strokeOpacity: role === "muted" ? 0.1 : role === "idle" ? 0.35 : 1,
		transition: "stroke 250ms ease, stroke-opacity 250ms ease, stroke-width 250ms ease"
	}

	return <BaseEdge path={path} style={style} className={cn(flowing && "graph-edge-flow")} />
}
