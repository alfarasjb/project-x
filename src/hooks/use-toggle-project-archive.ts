import { useMutation, useQueryClient } from "@tanstack/react-query"
import { apiRoutes } from "@shared/api-routes"
import { ProjectSchema, type Project } from "@shared/schemas/project"
import { apiPost } from "@/lib/api"
import { queryKeys } from "@/lib/query-keys"

/**
 * Toggle a project's archived state — picks the archive or unarchive
 * endpoint based on whether the project is currently archived. One
 * conceptual user action ("toggle archived"), two REST endpoints; the
 * branching belongs in the hook so the call site stays single-button.
 *
 * Cache contract: invalidate both the active and archived lists since a
 * toggle moves the row across the partition.
 */
export function useToggleProjectArchive(project: Project) {
	const queryClient = useQueryClient()
	const isArchived = project.archivedAt !== null
	return useMutation({
		mutationFn: () =>
			apiPost(
				isArchived ? apiRoutes.projectUnarchive(project.id) : apiRoutes.projectArchive(project.id),
				ProjectSchema
			),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all })
		}
	})
}
