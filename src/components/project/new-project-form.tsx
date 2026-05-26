import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { useCreateProject } from "@/hooks/use-create-project"
import { routes } from "@/lib/routes"
import { toastError } from "@/lib/toast"

/**
 * Adds a project — name + an absolute path to a local repo. On success the
 * new project's dashboard opens (empty, awaiting a crawl). A bad path comes
 * back from the server as a 400 and is shown inline. `orgSlug` is the
 * active workspace's slug from the URL — every nav stays inside that
 * workspace.
 *
 * Mutation lives in `useCreateProject` — this component only wires UI
 * concerns (form state, validation, navigation, error display).
 */
export function NewProjectForm({ orgSlug }: { orgSlug: string }) {
	const [name, setName] = useState("")
	const [rootPath, setRootPath] = useState("")
	const navigate = useNavigate()

	const { mutate, isPending, error } = useCreateProject()

	const inputClass =
		"w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none transition-colors focus:border-foreground/30"

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault()
				if (!name.trim() || !rootPath.trim()) return
				mutate(
					{ source: "local", name, rootPath },
					{
						onSuccess: (project) => {
							void navigate({
								to: routes.project,
								params: { orgSlug, projectSlug: project.slug }
							})
						},
						onError: (cause) => toastError(cause, "Create failed.")
					}
				)
			}}
			className="space-y-3"
		>
			<div className="space-y-1">
				<label className="text-xs font-medium" htmlFor="project-name">
					Name
				</label>
				<input
					id="project-name"
					value={name}
					onChange={(event) => setName(event.target.value)}
					placeholder="My Repo"
					className={inputClass}
				/>
			</div>
			<div className="space-y-1">
				<label className="text-xs font-medium" htmlFor="project-path">
					Repository path
				</label>
				<input
					id="project-path"
					value={rootPath}
					onChange={(event) => setRootPath(event.target.value)}
					placeholder="D:\Files\Repositories\..."
					className={`${inputClass} font-mono text-xs`}
				/>
				<p className="text-muted-foreground text-[11px]">
					Absolute path to a local repository directory.
				</p>
			</div>
			<button
				type="submit"
				disabled={isPending || !name.trim() || !rootPath.trim()}
				className="bg-primary text-primary-foreground flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
			>
				<Plus className="h-3.5 w-3.5" />
				{isPending ? "Creating…" : "Add project"}
			</button>
			{error && <p className="text-destructive text-xs">{error.message}</p>}
		</form>
	)
}
