import { createFileRoute, Outlet } from "@tanstack/react-router"
import { graphQueryOptions, projectQueryOptions } from "@/lib/queries"
import { CrawlButton } from "@/components/graph/crawl-button"
import { ProjectSwitcher } from "@/components/layout/project-switcher"

export const Route = createFileRoute("/$orgSlug/projects/$projectId")({
	component: ProjectLayout,
	loader: ({ context, params }) => {
		// Warm both caches: the switcher reads the project list, both child
		// routes read the graph. `prefetchQuery` never rejects — failures surface
		// in the views below.
		void context.queryClient.prefetchQuery(projectQueryOptions(params.projectId))
		void context.queryClient.prefetchQuery(graphQueryOptions(params.projectId))
	}
})

/**
 * Per-project layout — a header carrying the project switcher and the Crawl
 * action, above the routed view. View selection (Dashboard / Graph) lives in
 * the sidebar; this header switches *which* project and crawls it.
 */
function ProjectLayout() {
	const { orgSlug, projectId } = Route.useParams()

	return (
		<div className="flex h-full flex-col">
			<header className="flex shrink-0 items-center gap-3 border-b px-4 py-2">
				<ProjectSwitcher orgSlug={orgSlug} projectId={projectId} />
				<div className="ml-auto">
					<CrawlButton projectId={projectId} />
				</div>
			</header>
			<div className="min-h-0 flex-1">
				<Outlet />
			</div>
		</div>
	)
}
