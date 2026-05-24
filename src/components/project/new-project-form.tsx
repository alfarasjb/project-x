import { useState, type FormEvent } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { apiRoutes } from "@shared/api-routes"
import { ProjectSchema } from "@shared/schemas/project"
import { apiPost } from "@/lib/api"
import { queryKeys } from "@/lib/query-keys"

/**
 * Adds a project — name + an absolute path to a local repo. On success the new
 * project's dashboard opens (empty, awaiting a crawl). A bad path comes back
 * from the server as a 400 and is shown inline. `orgSlug` is the active
 * workspace's slug from the URL — every nav stays inside that workspace.
 */
export function NewProjectForm({ orgSlug }: { orgSlug: string }) {
	const [name, setName] = useState("")
	const [rootPath, setRootPath] = useState("")
	const queryClient = useQueryClient()
	const navigate = useNavigate()

	const { mutate, isPending, error } = useMutation({
		mutationFn: () => apiPost(apiRoutes.projectsList, ProjectSchema, { name, rootPath }),
		onSuccess: (project) => {
			void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all })
			void navigate({
				to: "/$orgSlug/projects/$projectId",
				params: { orgSlug, projectId: project.id }
			})
		}
	})

	function handleSubmit(event: FormEvent) {
		event.preventDefault()
		if (name.trim() && rootPath.trim()) mutate()
	}

	const inputClass =
		"w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none transition-colors focus:border-foreground/30"

	return (
		<form onSubmit={handleSubmit} className="bg-card space-y-3 rounded-xl border p-4">
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
