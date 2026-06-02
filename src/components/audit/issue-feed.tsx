import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Search } from "lucide-react"
import type {
	GodFileVerdict,
	Issue,
	IssueRefinement,
	IssueSeverity,
	RefinementVerdict
} from "@shared/schemas/issue"
import { issuesQueryOptions } from "@/lib/queries"
import { cn } from "@/lib/utils"

/** Filter + sort + page state — all client-side; the API returns the full list. */
type SeverityFilter = "all" | IssueSeverity
type SortKey = "severity" | "blast" | "detected"
const PAGE_SIZE = 20

/**
 * Issue Feed — the dashboard's primary working surface.
 *
 * Dense list of audit findings (heuristic + AI-Review), with a toolbar for
 * search/filter/sort and pagination at the bottom. Selection is *controlled*
 * by the parent route so it can render the detail side-panel alongside —
 * clicking a row calls `onSelect(issue.id)`, and the selected row is
 * highlighted via the same `selectedIssueId`.
 *
 * The list deliberately doesn't expand inline anymore; all detail lives in
 * the side panel. Single-source-of-truth for "what am I reading right now."
 */
export function IssueFeed({
	projectId,
	selectedIssueId,
	onSelect
}: {
	projectId: string
	selectedIssueId: string | null
	onSelect: (id: string | null) => void
}) {
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

	if (isLoading) {
		return (
			<FeedShell>
				<p className="text-muted-foreground text-sm">Loading…</p>
			</FeedShell>
		)
	}
	if (error) {
		return (
			<FeedShell>
				<p className="text-destructive text-sm">{error.message}</p>
			</FeedShell>
		)
	}

	return (
		<FeedShell>
			<div className="shrink-0">
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
			</div>

			{filtered.length === 0 ? (
				<div className="border-border border-y px-4 py-10 text-center">
					<p className="text-muted-foreground text-sm">
						{issues && issues.length > 0
							? "No issues match the current filters."
							: "No issues. Crawl the project to run the audit."}
					</p>
				</div>
			) : (
				<>
					<ul className="border-border min-h-0 flex-1 overflow-y-auto border-t">
						{pageItems.map((issue) => (
							<IssueRow
								key={issue.id}
								issue={issue}
								selected={issue.id === selectedIssueId}
								onSelect={onSelect}
							/>
						))}
					</ul>
					<div className="shrink-0">
						<Pagination
							start={filtered.length === 0 ? 0 : pageStart + 1}
							end={pageEnd}
							total={filtered.length}
							page={safePage}
							pageCount={pageCount}
							onPage={setPage}
						/>
					</div>
				</>
			)}
		</FeedShell>
	)
}

/**
 * Outer chrome — flex column that fills the height handed to it by the
 * route. The (now sibling) `IssueStats` strip and project layout header
 * handle the title + counts + Analyze affordances; this just holds the
 * toolbar, list, and pagination.
 */
function FeedShell({ children }: { children: React.ReactNode }) {
	return <section className="flex min-h-0 flex-1 flex-col gap-3">{children}</section>
}

/**
 * One row in the dense list view. Severity is encoded as a 2px left border
 * (no rounded corners, no icon noise). Click selects the row and opens the
 * detail side-panel upstream. Selected row gets a subtle bg highlight.
 */
function IssueRow({
	issue,
	selected,
	onSelect
}: {
	issue: Issue
	selected: boolean
	onSelect: (id: string | null) => void
}) {
	const blast = issue.blastRadius?.upstream
	return (
		<li className="border-border border-b last:border-b-0">
			<button
				type="button"
				onClick={() => onSelect(selected ? null : issue.id)}
				className={cn(
					"flex w-full items-start gap-3 border-l-2 py-2.5 pr-3 pl-3 text-left transition-colors",
					SEVERITY_BORDER[issue.severity],
					selected ? "bg-muted/60" : "hover:bg-muted/30",
					// A false-positive verdict (dismissed duplicate OR "not a god file")
					// stays in the feed as the receipt, but dimmed.
					issue.refinement?.verdict === "false-positive" && "opacity-55"
				)}
			>
				<div className="min-w-0 flex-1">
					<div className="flex items-baseline gap-2.5">
						<span className="truncate text-[13px] font-medium leading-tight">{issue.title}</span>
						<span className="text-muted-foreground shrink-0 font-mono text-[10px]">
							{issue.category}
						</span>
					</div>
					<div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px]">
						<span>
							{issue.affected.length} file{issue.affected.length === 1 ? "" : "s"}
						</span>
						{blast !== undefined && (
							<span>
								blast <span className={cn("font-medium", blastColor(blast))}>{blast}</span>
							</span>
						)}
						{issue.concerns && issue.concerns.length > 0 && (
							<span>
								{issue.concerns.length} concern{issue.concerns.length === 1 ? "" : "s"}
							</span>
						)}
						{issue.refinement && (
							<span className={cn("font-medium", VERDICT_TEXT[issue.refinement.verdict])}>
								{verdictShort(issue.refinement)}
							</span>
						)}
						<span>{formatDetected(issue.firstDetected)}</span>
					</div>
				</div>
			</button>
		</li>
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
		<div className="text-muted-foreground flex items-center justify-between pt-2 text-[11px]">
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
	if (issue.refinement?.reasoning.toLowerCase().includes(query)) return true
	if (
		issue.refinement?.kind === "duplicate" &&
		issue.refinement.consolidation?.toLowerCase().includes(query)
	)
		return true
	if (
		issue.refinement?.kind === "god-file" &&
		issue.refinement.splitPlan?.toLowerCase().includes(query)
	)
		return true
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

const SEVERITY_RANK: Record<IssueSeverity, number> = {
	critical: 0,
	warning: 1,
	info: 2
}

function bySeverity(a: Issue, b: Issue): number {
	return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
}

/** Format an ISO timestamp for the dense row footer. "Today" / "Yesterday" / date. */
function formatDetected(iso: string): string {
	const detected = new Date(iso)
	const now = new Date()
	const sameDay =
		detected.getFullYear() === now.getFullYear() &&
		detected.getMonth() === now.getMonth() &&
		detected.getDate() === now.getDate()
	if (sameDay)
		return `today ${detected.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
	const yesterday = new Date(now)
	yesterday.setDate(now.getDate() - 1)
	const isYesterday =
		detected.getFullYear() === yesterday.getFullYear() &&
		detected.getMonth() === yesterday.getMonth() &&
		detected.getDate() === yesterday.getDate()
	if (isYesterday) return "yesterday"
	return detected.toLocaleDateString()
}

/** Colour the blast number when it's high enough to matter. */
function blastColor(blast: number): string {
	if (blast >= 20) return "text-destructive"
	if (blast >= 8) return "text-amber-600 dark:text-amber-400"
	return ""
}

const SEVERITY_BORDER: Record<IssueSeverity, string> = {
	critical: "border-l-destructive",
	warning: "border-l-amber-500/70",
	info: "border-l-border"
}

/**
 * Compact verdict label for a refined row. Keyed by kind THEN verdict because
 * "partial"/"false-positive" exist in both vocabularies but read differently.
 */
const DUPLICATE_VERDICT_SHORT: Record<RefinementVerdict, string> = {
	duplicate: "verified duplicate",
	partial: "partial overlap",
	"false-positive": "vetoed"
}

const GOD_FILE_VERDICT_SHORT: Record<GodFileVerdict, string> = {
	"should-split": "should split",
	partial: "extract a chunk",
	"false-positive": "not a god file"
}

function verdictShort(refinement: IssueRefinement): string {
	return refinement.kind === "duplicate"
		? DUPLICATE_VERDICT_SHORT[refinement.verdict]
		: GOD_FILE_VERDICT_SHORT[refinement.verdict]
}

/** Colour is keyed by verdict alone — the palette maps cleanly across both kinds. */
const VERDICT_TEXT: Record<RefinementVerdict | GodFileVerdict, string> = {
	duplicate: "text-amber-600 dark:text-amber-400",
	"should-split": "text-amber-600 dark:text-amber-400",
	partial: "text-blue-600 dark:text-blue-400",
	"false-positive": "text-muted-foreground"
}
