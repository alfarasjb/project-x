import { createFileRoute } from "@tanstack/react-router"
import { GraphGuard } from "@/components/project/graph-guard"
import { BlueprintHealth } from "@/components/project/blueprint-health"
import { IssueFeed } from "@/components/audit/issue-feed"
import { issuesQueryOptions } from "@/lib/queries"

export const Route = createFileRoute("/$orgSlug/projects/$projectId/")({
	component: DashboardRoute,
	loader: ({ context, params }) => {
		// Warm the issues cache so the feed renders without a flash.
		void context.queryClient.prefetchQuery(issuesQueryOptions(params.projectId))
	}
})

/**
 * The project's main view — Blueprint Health up top as a quick at-a-glance
 * summary, then the Issue Feed below as the working surface.
 */
function DashboardRoute() {
	const { projectId } = Route.useParams()

	return (
		<GraphGuard projectId={projectId}>
			{(graph) => (
				<div className="h-full overflow-y-auto">
					<div className="mx-auto max-w-4xl space-y-6 px-6 py-6">
						<BlueprintHealth projectId={projectId} graph={graph} />
						<IssueFeed projectId={projectId} />
					</div>
				</div>
			)}
		</GraphGuard>
	)
}
