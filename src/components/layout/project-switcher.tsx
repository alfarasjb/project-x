import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Check, ChevronsUpDown, Plus } from "lucide-react"
import { projectsQueryOptions } from "@/lib/queries"
import { cn } from "@/lib/utils"

/**
 * Header project switcher — a dropdown that picks which project the workspace
 * is showing. Closes via a transparent full-screen click-catcher rendered
 * behind the menu, so no ref/effect is needed. `orgSlug` comes from the
 * route params; every Link is built relative to that current workspace.
 */
export function ProjectSwitcher({ orgSlug, projectId }: { orgSlug: string; projectId: string }) {
	const [open, setOpen] = useState(false)
	const { data: projects } = useQuery(projectsQueryOptions())
	const current = projects?.find((project) => project.id === projectId)

	return (
		<div className="relative">
			<button
				type="button"
				onClick={() => setOpen((value) => !value)}
				className="hover:bg-muted flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
			>
				<span className="max-w-[200px] truncate">{current?.name ?? "Select project"}</span>
				<ChevronsUpDown className="text-muted-foreground size-3.5 shrink-0" />
			</button>

			{open && (
				<>
					<div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
					<div className="bg-card absolute left-0 z-30 mt-1 w-60 rounded-md border p-1 shadow-md">
						<div className="text-muted-foreground px-2 py-1 text-[10px] font-semibold tracking-wide uppercase">
							Projects
						</div>
						{projects?.map((project) => (
							<Link
								key={project.id}
								to="/$orgSlug/projects/$projectSlug"
								params={{ orgSlug, projectSlug: project.slug }}
								onClick={() => setOpen(false)}
								className="hover:bg-muted flex items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors"
							>
								<Check
									className={cn(
										"size-3.5 shrink-0",
										project.id === projectId ? "opacity-100" : "opacity-0"
									)}
								/>
								<span className="truncate">{project.name}</span>
							</Link>
						))}
						<div className="my-1 border-t" />
						<Link
							to="/$orgSlug/projects"
							params={{ orgSlug }}
							onClick={() => setOpen(false)}
							className="text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors"
						>
							<Plus className="size-3.5 shrink-0" />
							New project
						</Link>
					</div>
				</>
			)}
		</div>
	)
}
