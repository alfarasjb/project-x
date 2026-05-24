import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Archive, ArchiveRestore, FolderGit2 } from "lucide-react"
import { apiRoutes } from "@shared/api-routes"
import { ProjectSchema, type Project } from "@shared/schemas/project"
import { apiPost } from "@/lib/api"
import { queryKeys } from "@/lib/query-keys"
import { toast, toastError } from "@/lib/toast"
import { cn } from "@/lib/utils"

/**
 * One project in the browser. Active projects link to their graph and offer an
 * Archive action; archived projects are dimmed, non-linking, and offer Restore.
 * Either action invalidates the `["projects", …]` lists so both refresh.
 */
export function ProjectCard({ project, orgSlug }: { project: Project; orgSlug: string }) {
	const queryClient = useQueryClient()
	const isArchived = project.archivedAt !== null

	const { mutate: toggleArchive, isPending } = useMutation({
		mutationFn: () =>
			apiPost(
				isArchived ? apiRoutes.projectUnarchive(project.id) : apiRoutes.projectArchive(project.id),
				ProjectSchema
			),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all })
			toast.success(isArchived ? `Restored "${project.name}"` : `Archived "${project.name}"`)
		},
		onError: (error) => toastError(error, isArchived ? "Restore failed." : "Archive failed.")
	})

	return (
		<div
			className={cn(
				"bg-card text-card-foreground rounded-xl border p-4 transition-colors",
				isArchived ? "opacity-60" : "hover:border-foreground/20"
			)}
		>
			<div className="flex items-start justify-between gap-3">
				<div className="min-w-0">
					<h3 className="font-display flex items-center gap-1.5 text-sm font-semibold">
						<FolderGit2 className="h-4 w-4 shrink-0 opacity-70" />
						<span className="truncate">{project.name}</span>
					</h3>
					<p className="text-muted-foreground mt-1 truncate font-mono text-xs">
						{project.rootPath}
					</p>
					<p className="text-muted-foreground mt-2 text-[11px]">
						{project.lastParsedAt
							? `Last crawled ${new Date(project.lastParsedAt).toLocaleString()}`
							: "Not yet crawled"}
					</p>
				</div>
				<button
					type="button"
					onClick={() => toggleArchive()}
					disabled={isPending}
					title={isArchived ? "Restore project" : "Archive project"}
					className="text-muted-foreground hover:text-foreground rounded-md border p-1.5 transition-colors disabled:opacity-50"
				>
					{isArchived ? (
						<ArchiveRestore className="h-3.5 w-3.5" />
					) : (
						<Archive className="h-3.5 w-3.5" />
					)}
				</button>
			</div>
			{!isArchived && (
				<Link
					to="/$orgSlug/projects/$projectSlug"
					params={{ orgSlug, projectSlug: project.slug }}
					className="text-primary mt-3 inline-block text-xs font-medium underline-offset-4 hover:underline"
				>
					Open →
				</Link>
			)}
		</div>
	)
}
