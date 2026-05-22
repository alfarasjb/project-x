import type { CSSProperties } from "react"
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "@xyflow/react"
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
 *
 * A trunk that aggregates several underlying dependencies (`data.count > 1`)
 * carries a small count label.
 */
export function SpotlightEdge({
	id,
	sourceX,
	sourceY,
	targetX,
	targetY,
	sourcePosition,
	targetPosition,
	data
}: EdgeProps) {
	const [path, labelX, labelY] = getSmoothStepPath({
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
	const count = typeof data?.count === "number" ? data.count : 1

	const style: CSSProperties = {
		stroke: STROKE[role],
		strokeWidth: flowing ? 2 : 1,
		strokeOpacity: role === "muted" ? 0.1 : role === "idle" ? 0.35 : 1,
		transition: "stroke 250ms ease, stroke-opacity 250ms ease, stroke-width 250ms ease",
		// Edges are non-interactive for now, so they never intercept clicks meant
		// for nodes / controls. Edge selection — to disambiguate overlapping
		// edges — is a later task; it'll need this relaxed.
		pointerEvents: "none"
	}

	return (
		<>
			<BaseEdge
				path={path}
				style={style}
				interactionWidth={0}
				className={cn(flowing && "graph-edge-flow")}
			/>
			{count > 1 && (
				<EdgeLabelRenderer>
					<div
						className="rounded border bg-card px-1 text-[9px] font-medium text-muted-foreground"
						style={{
							position: "absolute",
							transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
							pointerEvents: "none"
						}}
					>
						{count}
					</div>
				</EdgeLabelRenderer>
			)}
		</>
	)
}
