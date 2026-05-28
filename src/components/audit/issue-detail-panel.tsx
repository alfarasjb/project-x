import type { Eye } from "lucide-react"
import { EyeOff, Inbox, MessageCircle, Network, X } from "lucide-react"
import type { Issue, IssueSeverity, RefinementVerdict } from "@shared/schemas/issue"
import { cn } from "@/lib/utils"

/**
 * Side-panel detail view for the currently-selected issue. Always rendered
 * by the route so the layout stays stable (no shift when the user clicks
 * an issue) — when `issue` is null we show an empty-state placeholder
 * instead of detail content.
 *
 * Lifecycle actions (View in graph, Ignore, Ask) are rendered as disabled
 * placeholders. They match the mockup's affordances so the layout is
 * stable when they ship, but they don't pretend to work today.
 */
export function IssueDetailPanel({ issue, onClose }: { issue: Issue | null; onClose: () => void }) {
	if (!issue) return <EmptyPanel />
	return (
		<div className="flex h-full flex-col px-5 py-5">
			<header className="mb-4 flex items-start justify-between gap-3">
				<div className="min-w-0">
					<div
						className={cn(
							"text-[10px] font-semibold uppercase tracking-[0.06em]",
							SEVERITY_LABEL_COLOR[issue.severity]
						)}
					>
						{issue.severity}
					</div>
					<h3 className="mt-1 text-sm font-medium leading-snug">{issue.title}</h3>
					<div className="text-muted-foreground mt-1 font-mono text-[10px]">{issue.category}</div>
				</div>
				<button
					type="button"
					onClick={onClose}
					aria-label="Close issue detail"
					className="text-muted-foreground hover:text-foreground hover:bg-muted/50 -m-1 shrink-0 rounded p-1 transition-colors"
				>
					<X className="size-4" />
				</button>
			</header>

			{issue.concerns && issue.concerns.length > 0 ? (
				<Section title="Concerns">
					<ul className="space-y-3">
						{issue.concerns.map((concern, idx) => (
							<li key={`${concern.category}:${idx}`}>
								<div className="text-muted-foreground mb-1 font-mono text-[10px] uppercase tracking-wide">
									{concern.category}
								</div>
								<p className="text-sm leading-snug">{concern.message}</p>
							</li>
						))}
					</ul>
				</Section>
			) : (
				<Section title="Description">
					<p className="text-sm leading-relaxed whitespace-pre-line">{issue.description}</p>
				</Section>
			)}

			{issue.refinement && (
				<Section title="AI verdict">
					<div className="mb-2">
						<span
							className={cn(
								"inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
								VERDICT_STYLE[issue.refinement.verdict]
							)}
						>
							{VERDICT_LABEL[issue.refinement.verdict]}
						</span>
					</div>
					<p className="text-sm leading-relaxed whitespace-pre-line">
						{issue.refinement.reasoning}
					</p>
					{issue.refinement.consolidation && (
						<div className="mt-3">
							<div className="text-muted-foreground mb-1 text-[10px] font-semibold uppercase tracking-wide">
								How to consolidate
							</div>
							<p className="text-sm leading-relaxed whitespace-pre-line">
								{issue.refinement.consolidation}
							</p>
						</div>
					)}
					{issue.refinement.excluded && issue.refinement.excluded.length > 0 && (
						<div className="mt-3">
							<div className="text-muted-foreground mb-1 text-[10px] font-semibold uppercase tracking-wide">
								Not actually duplicates
							</div>
							<ul className="text-muted-foreground space-y-1 font-mono text-[11px] leading-relaxed">
								{issue.refinement.excluded.map((path) => (
									<li key={path}>{path}</li>
								))}
							</ul>
						</div>
					)}
				</Section>
			)}

			{issue.affected.length > 0 && (
				<Section title="Affected">
					<ul className="space-y-1 font-mono text-[11px] leading-relaxed">
						{issue.affected.map((path) => (
							<li key={path}>{path}</li>
						))}
					</ul>
				</Section>
			)}

			{issue.blastRadius && (
				<Section title="Blast radius">
					<div className="text-muted-foreground flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs">
						<Stat value={issue.blastRadius.upstream} label="upstream" />
						<Stat value={issue.blastRadius.downstream} label="downstream" />
						<Stat value={issue.blastRadius.modulesTouched} label="modules" />
					</div>
				</Section>
			)}

			<div className="mt-2 mb-4 flex gap-2">
				<DisabledAction icon={Network} label="View in graph" tooltip="Coming soon" />
				<DisabledAction icon={EyeOff} label="Ignore" tooltip="Coming soon" />
			</div>

			<div className="mt-auto border-t pt-4">
				<div className="text-muted-foreground mb-2 text-[10px] font-semibold uppercase tracking-[0.06em]">
					Ask about this issue
				</div>
				<DisabledAction
					icon={MessageCircle}
					label="Coming soon"
					tooltip="Chat on an issue is not yet wired"
					full
				/>
			</div>

			<div className="text-muted-foreground mt-4 text-[10px]">
				First detected {new Date(issue.firstDetected).toLocaleString()}
			</div>
		</div>
	)
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div className="mb-5">
			<div className="text-muted-foreground mb-2 text-[10px] font-semibold uppercase tracking-[0.06em]">
				{title}
			</div>
			{children}
		</div>
	)
}

function Stat({ value, label }: { value: number; label: string }) {
	return (
		<span>
			<span className="text-foreground font-medium">{value}</span> {label}
		</span>
	)
}

function DisabledAction({
	icon: Icon,
	label,
	tooltip,
	full
}: {
	icon: typeof Eye
	label: string
	tooltip: string
	full?: boolean
}) {
	return (
		<button
			type="button"
			disabled
			title={tooltip}
			className={cn(
				"text-muted-foreground bg-card flex items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-xs",
				"cursor-not-allowed opacity-60",
				full ? "w-full" : "flex-1"
			)}
		>
			<Icon className="size-3.5" />
			{label}
		</button>
	)
}

const SEVERITY_LABEL_COLOR: Record<IssueSeverity, string> = {
	critical: "text-destructive",
	warning: "text-amber-600 dark:text-amber-400",
	info: "text-blue-600 dark:text-blue-400"
}

const VERDICT_LABEL: Record<RefinementVerdict, string> = {
	duplicate: "Duplicate",
	partial: "Partial overlap",
	"false-positive": "Not a duplicate"
}

const VERDICT_STYLE: Record<RefinementVerdict, string> = {
	duplicate: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
	partial: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
	"false-positive": "bg-muted text-muted-foreground"
}

/**
 * Placeholder shown when nothing is selected. The panel is always rendered
 * by the route (so the layout doesn't shift when the user clicks a row),
 * and this is what fills the column in the meantime.
 */
function EmptyPanel() {
	return (
		<div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
			<Inbox className="size-7 opacity-40" strokeWidth={1.5} />
			<div className="text-sm">No issue selected</div>
			<p className="text-[11px] leading-relaxed opacity-80">
				Pick a row from the feed to see its detail, affected files, and blast radius.
			</p>
		</div>
	)
}
