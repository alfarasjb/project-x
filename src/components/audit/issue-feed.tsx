import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { AlertOctagon, AlertTriangle, ChevronDown, ChevronRight, Info, Search } from "lucide-react"
import type { Issue, IssueSeverity } from "@shared/schemas/issue"
import { AnalyzeButton } from "@/components/audit/analyze-button"
import { issuesQueryOptions } from "@/lib/queries"
import { cn } from "@/lib/utils"

/** Filter + sort + page state — all client-side; the API returns the full list. */
type SeverityFilter = "all" | IssueSeverity
type SortKey = "severity" | "blast" | "detected"
const PAGE_SIZE = 20

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
	const [search, setSearch] = useState("")
	const [severity, setSeverity] = useState<SeverityFilter>("all")
	const [category, setCategory] = useState<string>("all")
	const [sortKey, setSortKey] = useState<SortKey>("severity")
	const [page, setPage] = useState(0)

	// Unique categories sourced from the data, not hard-coded — new rules
	// (boundary, ai-review, future) appear in the dropdown automatically.
	const categories = useMemo(() => {
		const set = new Set<string>()
		for (const issue of issues ?? []) set.add(issue.category)
		return [...set].sort()
	}, [issues])

	// Derived list: filter → sort → paginate. Recomputes only when inputs change.
	const filtered = useMemo(() => {
		const haystack = search.trim().toLowerCase()
		return (issues ?? [])
			.filter((issue) => (severity === "all" ? true : issue.severity === severity))
			.filter((issue) => (category === "all" ? true : issue.category === category))
			.filter((issue) => (haystack ? matchesSearch(issue, haystack) : true))
			.sort(sortComparator(sortKey))
	}, [issues, search, severity, category, sortKey])

	// Reset to first page when a filter change shrinks the result set out from under us.
	const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
	const safePage = Math.min(page, pageCount - 1)
	const pageStart = safePage * PAGE_SIZE
	const pageEnd = Math.min(pageStart + PAGE_SIZE, filtered.length)
	const pageItems = filtered.slice(pageStart, pageEnd)

	const counts = useMemo(() => countBySeverity(issues ?? []), [issues])

	if (isLoading) {
		return (
			<FeedShell projectId={projectId}>
				<p className="text-muted-foreground text-sm">Loading…</p>
			</FeedShell>
		)
	}
	if (error) {
		return (
			<FeedShell projectId={projectId}>
				<p className="text-destructive text-sm">{error.message}</p>
			</FeedShell>
		)
	}

	return (
		<FeedShell projectId={projectId} counts={counts} total={issues?.length ?? 0}>
			<Toolbar
				search={search}
				onSearch={(value) => {
					setSearch(value)
					setPage(0)
				}}
				severity={severity}
				onSeverity={(value) => {
					setSeverity(value)
					setPage(0)
				}}
				category={category}
				categories={categories}
				onCategory={(value) => {
					setCategory(value)
					setPage(0)
				}}
				sortKey={sortKey}
				onSortKey={setSortKey}
			/>

			{filtered.length === 0 ? (
				<div className="bg-card rounded-xl border px-4 py-6 text-center">
					<p className="text-muted-foreground text-sm">
						{issues && issues.length > 0
							? "No issues match the current filters."
							: "No issues. Crawl the project to run the audit."}
					</p>
				</div>
			) : (
				<>
					<div className="flex flex-col gap-2">
						{pageItems.map((issue) => (
							<IssueCard key={issue.id} issue={issue} />
						))}
					</div>
					<Pagination
						start={filtered.length === 0 ? 0 : pageStart + 1}
						end={pageEnd}
						total={filtered.length}
						page={safePage}
						pageCount={pageCount}
						onPage={setPage}
					/>
				</>
			)}
		</FeedShell>
	)
}

/** Outer chrome — header with title, counts, and the Analyze button. */
function FeedShell({
	projectId,
	counts,
	total,
	children
}: {
	projectId: string
	counts?: Record<IssueSeverity, number>
	total?: number
	children: React.ReactNode
}) {
	return (
		<section className="space-y-3">
			<header className="flex items-start justify-between gap-3">
				<div className="flex items-baseline gap-3">
					<h2 className="font-display text-sm font-semibold">
						Issues{" "}
						{total !== undefined && (
							<span className="text-muted-foreground font-normal">({total})</span>
						)}
					</h2>
					{counts && total !== undefined && total > 0 && (
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
			{children}
		</section>
	)
}

function Toolbar({
	search,
	onSearch,
	severity,
	onSeverity,
	category,
	categories,
	onCategory,
	sortKey,
	onSortKey
}: {
	search: string
	onSearch: (value: string) => void
	severity: SeverityFilter
	onSeverity: (value: SeverityFilter) => void
	category: string
	categories: string[]
	onCategory: (value: string) => void
	sortKey: SortKey
	onSortKey: (value: SortKey) => void
}) {
	return (
		<div className="flex items-center gap-2">
			<div className="relative flex-1">
				<Search className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
				<input
					type="text"
					value={search}
					onChange={(event) => onSearch(event.target.value)}
					placeholder="Search issues, files, or concerns"
					className="border-border bg-card focus:border-foreground/30 h-8 w-full rounded-md border pr-2 pl-8 text-xs outline-none"
				/>
			</div>
			<select
				value={severity}
				onChange={(event) => onSeverity(event.target.value as SeverityFilter)}
				className="border-border bg-card h-8 rounded-md border px-2 text-xs"
				aria-label="Filter by severity"
			>
				<option value="all">All severities</option>
				<option value="critical">Critical</option>
				<option value="warning">Warning</option>
				<option value="info">Info</option>
			</select>
			<select
				value={category}
				onChange={(event) => onCategory(event.target.value)}
				className="border-border bg-card h-8 rounded-md border px-2 text-xs"
				aria-label="Filter by category"
			>
				<option value="all">All categories</option>
				{categories.map((cat) => (
					<option key={cat} value={cat}>
						{cat}
					</option>
				))}
			</select>
			<select
				value={sortKey}
				onChange={(event) => onSortKey(event.target.value as SortKey)}
				className="border-border bg-card h-8 rounded-md border px-2 text-xs"
				aria-label="Sort by"
			>
				<option value="severity">Sort: severity</option>
				<option value="blast">Sort: blast radius</option>
				<option value="detected">Sort: first detected</option>
			</select>
		</div>
	)
}

function Pagination({
	start,
	end,
	total,
	page,
	pageCount,
	onPage
}: {
	start: number
	end: number
	total: number
	page: number
	pageCount: number
	onPage: (value: number) => void
}) {
	if (pageCount <= 1) return null
	return (
		<div className="text-muted-foreground flex items-center justify-between text-[11px]">
			<span>
				Showing {start}–{end} of {total}
			</span>
			<div className="flex gap-1">
				<button
					type="button"
					onClick={() => onPage(page - 1)}
					disabled={page === 0}
					className="border-border bg-card hover:bg-muted/50 rounded-md border px-2 py-1 text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
				>
					Prev
				</button>
				<button
					type="button"
					onClick={() => onPage(page + 1)}
					disabled={page >= pageCount - 1}
					className="border-border bg-card hover:bg-muted/50 rounded-md border px-2 py-1 text-[11px] disabled:cursor-not-allowed disabled:opacity-50"
				>
					Next
				</button>
			</div>
		</div>
	)
}

/**
 * Search predicate: case-insensitive substring match across the title, the
 * affected paths, and (for ai-review) the concern messages. Concern messages
 * matter — they're often the most descriptive text on an issue.
 */
function matchesSearch(issue: Issue, query: string): boolean {
	if (issue.title.toLowerCase().includes(query)) return true
	if (issue.affected.some((path) => path.toLowerCase().includes(query))) return true
	if (issue.concerns?.some((concern) => concern.message.toLowerCase().includes(query))) return true
	if (issue.description.toLowerCase().includes(query)) return true
	return false
}

function sortComparator(key: SortKey): (a: Issue, b: Issue) => number {
	if (key === "blast") {
		return (a, b) => (b.blastRadius?.total ?? 0) - (a.blastRadius?.total ?? 0) || bySeverity(a, b)
	}
	if (key === "detected") {
		// Newest first.
		return (a, b) => b.firstDetected.localeCompare(a.firstDetected)
	}
	return bySeverity
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
