import { useState } from "react"
import { createFileRoute, getRouteApi, useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { useRenameProject } from "@/hooks/use-rename-project"
import { projectQueryOptions } from "@/lib/queries"
import { routes } from "@/lib/routes"
import { toast, toastError } from "@/lib/toast"
import { Button } from "@/components/ui/button"

// Parent does slug → id resolution; read the id from its loader data.
const parentRoute = getRouteApi(routes.project)

export const Route = createFileRoute("/$orgSlug/projects/$projectSlug/settings")({
	component: SettingsRoute
})

/**
 * Project settings — currently just rename. The slug stays stable across
 * renames (URLs + MCP bindings don't break); only the display name changes.
 *
 * Settings page rather than a modal because we'll grow it: repo path, archive
 * controls, eventually crawl/analyze defaults, danger-zone deletion. A page
 * lets each concern get its own section without modal-stacking.
 */
function SettingsRoute() {
	const { projectId } = parentRoute.useLoaderData()
	const { orgSlug } = parentRoute.useParams()
	const navigate = useNavigate()
	const { data: project } = useQuery(projectQueryOptions(projectId))
	const [name, setName] = useState("")

	// Seed the input once the project loads. The empty-string initial state is
	// deliberate — placeholder UX while loading is fine; we don't want to flash
	// an out-of-date project name.
	const displayName = name === "" ? (project?.name ?? "") : name

	const { mutate: rename, isPending: isRenaming } = useRenameProject(projectId)

	const trimmed = displayName.trim()
	const dirty = project ? trimmed !== project.name : false
	const canSubmit = dirty && trimmed.length > 0 && !isRenaming

	function handleBack(): void {
		void navigate({
			to: routes.project,
			params: { orgSlug, projectSlug: project?.slug ?? "" }
		})
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			<div className="mx-auto w-full max-w-2xl space-y-6 px-6 py-8">
				<header>
					<h1 className="font-display text-xl font-bold tracking-tight">Project settings</h1>
					<p className="text-muted-foreground mt-1 text-sm">
						Configure how Project X handles this repo. The slug ({project?.slug ?? "…"}) stays
						stable across renames so URLs and MCP bindings keep working.
					</p>
				</header>

				<form
					onSubmit={(event) => {
						event.preventDefault()
						if (!canSubmit) return
						rename(trimmed, {
							onSuccess: (updated) => toast.success(`Renamed to "${updated.name}".`),
							onError: (cause) => toastError(cause, "Rename failed.")
						})
					}}
					className="bg-card space-y-3 rounded-xl border p-4"
				>
					<div className="space-y-1">
						<label className="text-xs font-medium" htmlFor="project-name">
							Name
						</label>
						<input
							id="project-name"
							value={displayName}
							onChange={(event) => setName(event.target.value)}
							placeholder={project?.name ?? "Project name"}
							disabled={!project || isRenaming}
							className="bg-background focus:border-foreground/30 w-full rounded-md border px-3 py-1.5 text-sm outline-none transition-colors disabled:opacity-60"
						/>
					</div>
					<div className="flex items-center gap-2">
						<Button type="submit" disabled={!canSubmit}>
							{isRenaming ? "Saving…" : "Save"}
						</Button>
						<Button type="button" variant="outline" onClick={handleBack}>
							Back
						</Button>
					</div>
				</form>

				<section className="text-muted-foreground space-y-2 text-xs">
					<h2 className="text-foreground text-sm font-medium">Repository source</h2>
					<p className="bg-muted/40 rounded border p-2 font-mono text-[11px]">
						{project ? (project.repoUrl ?? project.rootPath ?? "—") : "Loading…"}
					</p>
					<p>
						Source changes aren&apos;t supported yet — archive and re-create the project to repoint.
					</p>
				</section>
			</div>
		</div>
	)
}
