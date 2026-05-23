import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { GraphGuard } from "@/components/project/graph-guard"
import { IssueDetailPanel } from "@/components/audit/issue-detail-panel"
import { IssueFeed } from "@/components/audit/issue-feed"
import { IssueStats } from "@/components/audit/issue-stats"
import { issuesQueryOptions } from "@/lib/queries"

export const Route = createFileRoute("/$orgSlug/projects/$projectId/")({
	component: DashboardRoute,
	loader: ({ context, params }) => {
		// Warm the issues cache so the feed renders without a flash.
		void context.queryClient.prefetchQuery(issuesQueryOptions(params.projectId))
	}
})

/**
 * The project's main view — issue stats up top, the dense Issue Feed in
 * the centre, and a right-side detail panel that's always rendered (shows
 * an empty-state placeholder when no issue is selected).
 *
 * Selection lives at the route (not inside `IssueFeed`) so the panel can
 * render as a sibling of the feed and the main column can flex around it.
 * The panel always renders so the layout doesn't shift when an issue is
 * picked or deselected.
 */
function DashboardRoute() {
	const { projectId } = Route.useParams()
	const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null)
	const { data: issues } = useQuery(issuesQueryOptions(projectId))
	const selectedIssue = selectedIssueId
		? (issues?.find((issue) => issue.id === selectedIssueId) ?? null)
		: null

	return (
		<GraphGuard projectId={projectId}>
			{() => (
				<div className="flex min-h-0 flex-1">
					<div className="flex min-h-0 min-w-0 flex-1 flex-col">
						<div className="mx-auto flex w-full min-h-0 min-w-0 max-w-4xl flex-1 flex-col gap-4 px-6 pt-5 pb-5">
							<IssueStats projectId={projectId} />
							<IssueFeed
								projectId={projectId}
								selectedIssueId={selectedIssueId}
								onSelect={setSelectedIssueId}
							/>
						</div>
					</div>
					<aside className="border-border w-[360px] shrink-0 overflow-y-auto border-l">
						<IssueDetailPanel issue={selectedIssue} onClose={() => setSelectedIssueId(null)} />
					</aside>
				</div>
			)}
		</GraphGuard>
	)
}
