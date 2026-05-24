import { createFileRoute, notFound, Outlet } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import {
	graphQueryOptions,
	issuesQueryOptions,
	projectQueryOptions,
	projectsQueryOptions
} from "@/lib/queries"
import { CrawlButton } from "@/components/graph/crawl-button"
import { ProjectSwitcher } from "@/components/layout/project-switcher"

export const Route = createFileRoute("/$orgSlug/projects/$projectSlug")({
	component: ProjectLayout,
	loader: async ({ context, params }) => {
		// Slug → id resolution happens here once, at the parent route. Child
		// routes pull the resolved id via `getRouteApi(...).useLoaderData()` so
		// the lookup isn't duplicated. Slugs are per-org and `projectsList`
		// already scopes to the active org via the auth session.
		const projects = await context.queryClient.ensureQueryData(projectsQueryOptions())
		const project = projects.find((p) => p.slug === params.projectSlug)
		if (!project) throw notFound()
		// Warm the per-project caches by id — children render against these.
		void context.queryClient.prefetchQuery(projectQueryOptions(project.id))
		void context.queryClient.prefetchQuery(graphQueryOptions(project.id))
		void context.queryClient.prefetchQuery(issuesQueryOptions(project.id))
		return { projectId: project.id }
	}
})

/**
 * Per-project layout — a header carrying the project switcher, the graph's
 * top-level stats (counts + last crawl), and the Crawl action, above the
 * routed view. View selection (Dashboard / Graph) lives in the sidebar.
 */
function ProjectLayout() {
	const { orgSlug } = Route.useParams()
	const { projectId } = Route.useLoaderData()
	const { data: graph } = useQuery(graphQueryOptions(projectId))
	const { data: project } = useQuery(projectQueryOptions(projectId))

	const moduleCount = graph?.nodes.filter((node) => node.kind === "module").length ?? 0
	const fileCount = graph?.nodes.filter((node) => node.kind === "file").length ?? 0
	const edgeCount = graph?.edges.length ?? 0
	const hasGraph = graph !== undefined && graph.nodes.length > 0

	return (
		<div className="flex h-full flex-col">
			<header className="flex shrink-0 items-center gap-3 border-b px-4 py-2">
				<ProjectSwitcher orgSlug={orgSlug} projectId={projectId} />
				{hasGraph && (
					<div className="text-muted-foreground hidden items-center gap-3 text-[11px] md:flex">
						<span>
							<span className="text-foreground font-medium">{moduleCount}</span> modules
						</span>
						<span>
							<span className="text-foreground font-medium">{fileCount}</span> files
						</span>
						<span>
							<span className="text-foreground font-medium">{edgeCount}</span> edges
						</span>
					</div>
				)}
				<div className="ml-auto flex items-center gap-3">
					<span className="text-muted-foreground hidden text-[11px] sm:inline">
						{project?.lastParsedAt
							? `Last crawl ${formatTime(project.lastParsedAt)}`
							: "Not yet crawled"}
					</span>
					<CrawlButton projectId={projectId} />
				</div>
			</header>
			<div className="flex min-h-0 flex-1 flex-col">
				<Outlet />
			</div>
		</div>
	)
}

/** Same-day → time-of-day, otherwise short date. Compact for the header. */
function formatTime(iso: string): string {
	const detected = new Date(iso)
	const now = new Date()
	const sameDay =
		detected.getFullYear() === now.getFullYear() &&
		detected.getMonth() === now.getMonth() &&
		detected.getDate() === now.getDate()
	if (sameDay) return detected.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
	return detected.toLocaleDateString()
}
