import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { ChevronDown, ChevronRight } from "lucide-react"
import { projectsQueryOptions } from "@/lib/queries"
import { AddProjectMenu } from "@/components/project/add-project-menu"
import { ProjectCard } from "@/components/project/project-card"

export const Route = createFileRoute("/$orgSlug/projects/")({
	component: ProjectsPage,
	loader: ({ context }) => {
		void context.queryClient.prefetchQuery(projectsQueryOptions())
	}
})

/**
 * The signed-in home for an org — the project grid is the centerpiece;
 * creation happens via a single dropdown CTA in the section header
 * (Local / From GitHub). Archived projects fold below.
 */
function ProjectsPage() {
	const { orgSlug } = Route.useParams()
	const { data: projects, error, isLoading } = useQuery(projectsQueryOptions())
	const [showArchived, setShowArchived] = useState(false)
	const archived = useQuery({
		...projectsQueryOptions({ archived: true }),
		enabled: showArchived
	})

	const hasProjects = Boolean(projects && projects.length > 0)

	return (
		<div className="h-full overflow-y-auto">
			<div className="mx-auto w-full max-w-3xl px-6 py-12">
				<header className="flex items-start justify-between gap-4">
					<div>
						<h1 className="font-display text-3xl font-bold tracking-tight">Projects</h1>
						<p className="text-muted-foreground mt-1 text-sm">
							Pick a repo to map, or add a new one.
						</p>
					</div>
					<AddProjectMenu orgSlug={orgSlug} />
				</header>

				<section className="mt-8">
					{isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
					{error && <p className="text-destructive text-sm">{error.message}</p>}
					{!isLoading && !error && !hasProjects && (
						<div className="bg-card text-muted-foreground rounded-xl border border-dashed p-8 text-center text-sm">
							No projects yet — use <span className="text-foreground font-medium">New project</span>{" "}
							above to add one.
						</div>
					)}
					{hasProjects && (
						<div className="grid gap-3 sm:grid-cols-2">
							{projects?.map((project) => (
								<ProjectCard key={project.id} project={project} orgSlug={orgSlug} />
							))}
						</div>
					)}
				</section>

				<section className="mt-10">
					<button
						type="button"
						onClick={() => setShowArchived((open) => !open)}
						className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
					>
						{showArchived ? (
							<ChevronDown className="h-3.5 w-3.5" />
						) : (
							<ChevronRight className="h-3.5 w-3.5" />
						)}
						Archived
					</button>
					{showArchived && (
						<div className="mt-3">
							{archived.isLoading && <p className="text-muted-foreground text-xs">loading…</p>}
							{archived.data && archived.data.length === 0 && (
								<p className="text-muted-foreground text-xs">No archived projects.</p>
							)}
							{archived.data && archived.data.length > 0 && (
								<div className="grid gap-3 sm:grid-cols-2">
									{archived.data.map((project) => (
										<ProjectCard key={project.id} project={project} orgSlug={orgSlug} />
									))}
								</div>
							)}
						</div>
					)}
				</section>
			</div>
		</div>
	)
}
