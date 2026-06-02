import { useState } from "react"
import { createFileRoute, getRouteApi } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { GraphGuard } from "@/components/project/graph-guard"
import { IssueDetailPanel } from "@/components/audit/issue-detail-panel"
import { IssueFeed } from "@/components/audit/issue-feed"
import { OverviewBand } from "@/components/audit/overview-band"
import { issuesQueryOptions } from "@/lib/queries"
import { routes } from "@/lib/routes"
import { cn } from "@/lib/utils"

// Parent route (`$orgSlug.projects.$projectSlug.tsx`) does the slug → id
// resolution + caches the issues list. Read the resolved id from there.
const parentRoute = getRouteApi(routes.project)

export const Route = createFileRoute("/$orgSlug/projects/$projectSlug/")({
	component: DashboardRoute
})

/**
 * The project's main view — an overview band (issue health + topology +
 * Analyze) above a full-width Issue Feed. The detail panel is a right-edge
 * slide-over: it's always mounted but translated off-screen until an issue is
 * selected, so opening it overlays the feed instead of permanently reserving a
 * dead 360px column.
 *
 * Selection lives at the route (not inside `IssueFeed`) so the slide-over can
 * render as a sibling of the feed.
 */
function DashboardRoute() {
	const { projectId } = parentRoute.useLoaderData()
	const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null)
	const { data: issues } = useQuery(issuesQueryOptions(projectId))
	const selectedIssue = selectedIssueId
		? (issues?.find((issue) => issue.id === selectedIssueId) ?? null)
		: null

	return (
		<GraphGuard projectId={projectId}>
			{() => (
				<div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
					<OverviewBand projectId={projectId} />
					<div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-6 py-5">
						<IssueFeed
							projectId={projectId}
							selectedIssueId={selectedIssueId}
							onSelect={setSelectedIssueId}
						/>
					</div>

					{/*
					 * Right-edge slide-over. Always mounted (so the transition runs
					 * both ways); translated off-screen + inert when no issue is
					 * selected. Honors reduced-motion by dropping the transition.
					 */}
					<aside
						aria-hidden={selectedIssue === null}
						className={cn(
							"border-border bg-card absolute inset-y-0 right-0 z-20 w-[400px] max-w-[90vw] overflow-y-auto border-l shadow-2xl transition-transform duration-200 ease-out motion-reduce:transition-none",
							selectedIssue ? "translate-x-0" : "pointer-events-none translate-x-full"
						)}
					>
						<IssueDetailPanel issue={selectedIssue} onClose={() => setSelectedIssueId(null)} />
					</aside>
				</div>
			)}
		</GraphGuard>
	)
}
