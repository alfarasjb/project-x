import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { AlertOctagon, AlertTriangle, ChevronDown, ChevronRight, Info } from "lucide-react"
import type { Issue, IssueSeverity } from "@shared/schemas/issue"
import { AnalyzeButton } from "@/components/audit/analyze-button"
import { issuesQueryOptions } from "@/lib/queries"
import { cn } from "@/lib/utils"

/**
 * Issue Feed — the primary dashboard panel.
 *
 * Reads the issues stored on the project (written at the end of each crawl)
 * and renders them as severity-ranked cards. Collapsed by default; click to
 * expand and see the description + affected files. Empty + loading states
 * are intentional — "no issues" should look intentional, not broken.
 */
export function IssueFeed({ projectId }: { projectId: string }) {
	const { data: issues, error, isLoading } = useQuery(issuesQueryOptions(projectId))

	if (isLoading) {
		return (
			<section className="space-y-3">
				<header className="flex items-start justify-between gap-3">
					<h2 className="font-display text-sm font-semibold">Issues</h2>
					<AnalyzeButton projectId={projectId} />
				</header>
				<p className="text-muted-foreground text-sm">Loading…</p>
			</section>
		)
	}

	if (error) {
		return (
			<section className="space-y-3">
				<header className="flex items-start justify-between gap-3">
					<h2 className="font-display text-sm font-semibold">Issues</h2>
					<AnalyzeButton projectId={projectId} />
				</header>
				<p className="text-destructive text-sm">{error.message}</p>
			</section>
		)
	}

	const sorted = [...(issues ?? [])].sort(bySeverity)
	const counts = countBySeverity(sorted)

	return (
		<section className="space-y-3">
			<header className="flex items-start justify-between gap-3">
				<div className="flex items-baseline gap-3">
					<h2 className="font-display text-sm font-semibold">
						Issues <span className="text-muted-foreground font-normal">({sorted.length})</span>
					</h2>
					{sorted.length > 0 && (
						<div className="text-muted-foreground flex items-center gap-3 text-[11px]">
							{counts.critical > 0 && (
								<span className="text-destructive font-medium">{counts.critical} critical</span>
							)}
							{counts.warning > 0 && <span>{counts.warning} warning</span>}
							{counts.info > 0 && <span>{counts.info} info</span>}
						</div>
					)}
				</div>
				<AnalyzeButton projectId={projectId} />
			</header>

			{sorted.length === 0 ? (
				<div className="bg-card rounded-xl border px-4 py-6 text-center">
					<p className="text-muted-foreground text-sm">
						No issues. Crawl the project to run the audit.
					</p>
				</div>
			) : (
				<div className="flex flex-col gap-2">
					{sorted.map((issue) => (
						<IssueCard key={issue.id} issue={issue} />
					))}
				</div>
			)}
		</section>
	)
}

function IssueCard({ issue }: { issue: Issue }) {
	const [open, setOpen] = useState(false)
	const Icon = SEVERITY_ICON[issue.severity]

	return (
		<div className="bg-card rounded-xl border transition-colors hover:border-foreground/20">
			<button
				type="button"
				onClick={() => setOpen((value) => !value)}
				className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
			>
				<Icon className={cn("size-4 shrink-0", SEVERITY_ICON_COLOR[issue.severity])} />
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<span
							className={cn(
								"rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
								SEVERITY_BADGE[issue.severity]
							)}
						>
							{issue.severity}
						</span>
						<span className="text-muted-foreground font-mono text-[10px]">{issue.category}</span>
					</div>
					<p className="mt-1 truncate text-sm">{issue.title}</p>
					<p className="text-muted-foreground mt-0.5 text-[11px]">
						{issue.affected.length} affected file{issue.affected.length === 1 ? "" : "s"}
						{issue.blastRadius
							? ` · ${issue.blastRadius.upstream} dependent${issue.blastRadius.upstream === 1 ? "" : "s"}`
							: ""}
					</p>
				</div>
				{open ? (
					<ChevronDown className="text-muted-foreground size-3.5 shrink-0" />
				) : (
					<ChevronRight className="text-muted-foreground size-3.5 shrink-0" />
				)}
			</button>

			{open && (
				<div className="space-y-3 border-t px-3 py-3">
					{issue.concerns && issue.concerns.length > 0 ? (
						<ul className="space-y-2">
							{issue.concerns.map((concern, idx) => (
								<li
									key={`${concern.category}:${idx}`}
									className="bg-muted/40 rounded-md border border-border/40 p-2.5"
								>
									<span className="bg-muted text-muted-foreground inline-block rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide">
										{concern.category}
									</span>
									<p className="mt-1.5 text-sm leading-snug">{concern.message}</p>
								</li>
							))}
						</ul>
					) : (
						<p className="text-sm leading-snug whitespace-pre-line">{issue.description}</p>
					)}
					{issue.affected.length > 0 && (
						<div className="space-y-1">
							<p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
								Affected
							</p>
							<ul className="space-y-0.5">
								{issue.affected.map((path) => (
									<li key={path} className="bg-muted/50 rounded px-2 py-1 font-mono text-[11px]">
										{path}
									</li>
								))}
							</ul>
						</div>
					)}
					{issue.blastRadius && (
						<div className="space-y-1">
							<p className="text-muted-foreground text-[11px] font-semibold uppercase tracking-wide">
								Blast radius
							</p>
							<div className="text-muted-foreground flex items-center gap-3 text-[11px]">
								<span>{issue.blastRadius.upstream} upstream</span>
								<span>{issue.blastRadius.downstream} downstream</span>
								<span>{issue.blastRadius.modulesTouched} modules touched</span>
							</div>
						</div>
					)}
					<p className="text-muted-foreground text-[10px]">
						First detected {new Date(issue.firstDetected).toLocaleString()}
					</p>
				</div>
			)}
		</div>
	)
}

const SEVERITY_RANK: Record<IssueSeverity, number> = {
	critical: 0,
	warning: 1,
	info: 2
}

function bySeverity(a: Issue, b: Issue): number {
	return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
}

function countBySeverity(issues: Issue[]): Record<IssueSeverity, number> {
	const counts: Record<IssueSeverity, number> = { critical: 0, warning: 0, info: 0 }
	for (const issue of issues) counts[issue.severity] += 1
	return counts
}

const SEVERITY_ICON: Record<IssueSeverity, typeof AlertOctagon> = {
	critical: AlertOctagon,
	warning: AlertTriangle,
	info: Info
}

const SEVERITY_ICON_COLOR: Record<IssueSeverity, string> = {
	critical: "text-destructive",
	warning: "text-amber-600 dark:text-amber-400",
	info: "text-blue-600 dark:text-blue-400"
}

const SEVERITY_BADGE: Record<IssueSeverity, string> = {
	critical: "bg-destructive/10 text-destructive",
	warning: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
	info: "bg-blue-500/10 text-blue-700 dark:text-blue-300"
}
