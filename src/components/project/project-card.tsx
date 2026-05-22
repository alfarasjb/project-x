import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Archive, ArchiveRestore, FolderGit2 } from "lucide-react"
import { ProjectSchema, type Project } from "@shared/schemas/project"
import { apiPost } from "@/lib/api"
import { cn } from "@/lib/utils"

/**
 * One project in the browser. Active projects link to their graph and offer an
 * Archive action; archived projects are dimmed, non-linking, and offer Restore.
 * Either action invalidates the `["projects", …]` lists so both refresh.
 */
export function ProjectCard({ project }: { project: Project }) {
	const queryClient = useQueryClient()
	const isArchived = project.archivedAt !== null

	const { mutate: toggleArchive, isPending } = useMutation({
		mutationFn: () =>
			apiPost(`/api/projects/${project.id}/${isArchived ? "unarchive" : "archive"}`, ProjectSchema),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ["projects"] })
		}
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
					to="/projects/$projectId"
					params={{ projectId: project.id }}
					className="text-primary mt-3 inline-block text-xs font-medium underline-offset-4 hover:underline"
				>
					Open graph →
				</Link>
			)}
		</div>
	)
}
