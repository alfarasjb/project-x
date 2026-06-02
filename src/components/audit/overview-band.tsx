import type { ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import type { Issue, IssueSeverity } from "@shared/schemas/issue"
import { AnalyzeButton } from "@/components/audit/analyze-button"
import { graphQueryOptions, issuesQueryOptions } from "@/lib/queries"
import { cn } from "@/lib/utils"

/**
 * Project dashboard overview band — the command-center strip at the top of the
 * dashboard. Two grouped readouts (issue health, then architecture topology)
 * with the Analyze action on the right, separated by hairline dividers.
 *
 * Replaces the old thin IssueStats row. Topology (modules / files / edges)
 * moved here from the project-layout header so the dashboard owns the
 * at-a-glance overview; the header keeps the cross-route Crawl + last-crawl.
 */
export function OverviewBand({ projectId }: { projectId: string }) {
	const { data: issues } = useQuery(issuesQueryOptions(projectId))
	const { data: graph } = useQuery(graphQueryOptions(projectId))

	const total = issues?.length ?? 0
	const counts = countBySeverity(issues ?? [])
	const moduleCount = graph?.nodes.filter((node) => node.kind === "module").length ?? 0
	const fileCount = graph?.nodes.filter((node) => node.kind === "file").length ?? 0
	const edgeCount = graph?.edges.length ?? 0

	return (
		<section className="flex shrink-0 flex-wrap items-center gap-x-8 gap-y-3 border-b px-6 py-3.5">
			<div className="flex items-baseline gap-5">
				<Group label="Issues">
					<span className="font-display text-2xl font-semibold leading-none">{total}</span>
				</Group>
				{total > 0 && (
					<div className="flex items-center gap-4 text-xs">
						<Severity value={counts.critical} label="critical" tone="critical" />
						<Severity value={counts.warning} label="warning" tone="warning" />
						<Severity value={counts.info} label="info" tone="info" />
					</div>
				)}
			</div>

			<Divider />

			<Group label="Architecture">
				<span className="flex items-baseline gap-2.5 text-sm">
					<Metric value={moduleCount} label="modules" />
					<span className="text-border">/</span>
					<Metric value={fileCount} label="files" />
					<span className="text-border">/</span>
					<Metric value={edgeCount} label="edges" />
				</span>
			</Group>

			<div className="ml-auto">
				<AnalyzeButton projectId={projectId} />
			</div>
		</section>
	)
}

function Group({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex flex-col gap-1">
			<span className="text-muted-foreground text-[10px] font-semibold uppercase tracking-[0.06em]">
				{label}
			</span>
			{children}
		</div>
	)
}

function Divider() {
	return <div className="bg-border hidden h-8 w-px self-center sm:block" />
}

const TONE: Record<IssueSeverity, string> = {
	critical: "text-destructive",
	warning: "text-warning",
	info: "text-info"
}

/** Severity readout: a square status marker + count + label, colored when non-zero. */
function Severity({ value, label, tone }: { value: number; label: string; tone: IssueSeverity }) {
	const active = value > 0
	return (
		<span className="flex items-center gap-1.5">
			<span
				className={cn("size-1.5", active ? cn("bg-current", TONE[tone]) : "bg-muted-foreground/40")}
			/>
			<span className={cn("font-medium", active ? TONE[tone] : "text-muted-foreground")}>
				{value}
			</span>
			<span className="text-muted-foreground">{label}</span>
		</span>
	)
}

function Metric({ value, label }: { value: number; label: string }) {
	return (
		<span className="text-muted-foreground">
			<span className="text-foreground font-medium">{value}</span> {label}
		</span>
	)
}

function countBySeverity(issues: Issue[]): Record<IssueSeverity, number> {
	const counts: Record<IssueSeverity, number> = { critical: 0, warning: 0, info: 0 }
	for (const issue of issues) counts[issue.severity] += 1
	return counts
}
