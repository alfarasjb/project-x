import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { ChevronDown, ChevronRight } from "lucide-react"
import { projectsQueryOptions } from "@/lib/queries"
import { NewProjectForm } from "@/components/project/new-project-form"
import { ProjectCard } from "@/components/project/project-card"

export const Route = createFileRoute("/")({
	component: HomePage,
	loader: ({ context }) => {
		void context.queryClient.prefetchQuery(projectsQueryOptions())
	}
})

function HomePage() {
	const { data: projects, error, isLoading } = useQuery(projectsQueryOptions())
	const [showArchived, setShowArchived] = useState(false)
	const archived = useQuery({
		...projectsQueryOptions({ archived: true }),
		enabled: showArchived
	})

	return (
		<main className="mx-auto min-h-screen w-full max-w-3xl px-6 py-12">
			<header>
				<h1 className="font-display text-3xl font-bold tracking-tight">Project X</h1>
				<p className="text-muted-foreground mt-1 text-sm">
					Architectural Co-Pilot — pick a repo to map.
				</p>
			</header>

			<section className="mt-8 space-y-3">
				<h2 className="text-sm font-semibold">New project</h2>
				<NewProjectForm />
			</section>

			<section className="mt-10 space-y-3">
				<h2 className="text-sm font-semibold">Projects</h2>
				{isLoading && <p className="text-muted-foreground text-sm">loading…</p>}
				{error && <p className="text-destructive text-sm">{error.message}</p>}
				{projects && projects.length === 0 && (
					<p className="text-muted-foreground text-sm">No projects yet — add one above.</p>
				)}
				{projects && projects.length > 0 && (
					<div className="grid gap-3 sm:grid-cols-2">
						{projects.map((project) => (
							<ProjectCard key={project.id} project={project} />
						))}
					</div>
				)}
			</section>

			<section className="mt-8">
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
									<ProjectCard key={project.id} project={project} />
								))}
							</div>
						)}
					</div>
				)}
			</section>
		</main>
	)
}
