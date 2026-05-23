import { useQuery } from "@tanstack/react-query"
import type { Issue, IssueSeverity } from "@shared/schemas/issue"
import { AnalyzeButton } from "@/components/audit/analyze-button"
import { issuesQueryOptions } from "@/lib/queries"

/**
 * Top-of-dashboard summary for the project's issue feed: the count first
 * (visually loud), severity breakdown next to it, and the Analyze button
 * on the right. Replaces the older BlueprintHealth panel; the graph
 * topology stats (modules / files / edges) live in the project layout
 * header now since they're useful on both Dashboard + Graph routes.
 */
export function IssueStats({ projectId }: { projectId: string }) {
	const { data: issues } = useQuery(issuesQueryOptions(projectId))
	const total = issues?.length ?? 0
	const counts = countBySeverity(issues ?? [])

	return (
		<div className="flex items-baseline justify-between gap-4">
			<div className="flex items-baseline gap-5">
				<div>
					<div className="text-muted-foreground text-[10px] font-semibold uppercase tracking-[0.06em]">
						Issues
					</div>
					<div className="font-display text-2xl font-semibold leading-none">{total}</div>
				</div>
				{total > 0 && (
					<div className="text-muted-foreground flex items-baseline gap-4 text-xs">
						<Stat value={counts.critical} label="critical" emphasis="critical" />
						<Stat value={counts.warning} label="warning" />
						<Stat value={counts.info} label="info" />
					</div>
				)}
			</div>
			<AnalyzeButton projectId={projectId} />
		</div>
	)
}

function Stat({ value, label, emphasis }: { value: number; label: string; emphasis?: "critical" }) {
	return (
		<span>
			<span
				className={
					emphasis === "critical" && value > 0
						? "text-destructive font-medium"
						: "text-foreground font-medium"
				}
			>
				{value}
			</span>{" "}
			{label}
		</span>
	)
}

function countBySeverity(issues: Issue[]): Record<IssueSeverity, number> {
	const counts: Record<IssueSeverity, number> = { critical: 0, warning: 0, info: 0 }
	for (const issue of issues) counts[issue.severity] += 1
	return counts
}
