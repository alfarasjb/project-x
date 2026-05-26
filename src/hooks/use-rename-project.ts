import { useMutation, useQueryClient } from "@tanstack/react-query"
import { apiRoutes } from "@shared/api-routes"
import { ProjectSchema } from "@shared/schemas/project"
import { apiPost } from "@/lib/api"
import { projectQueryOptions, projectsQueryOptions } from "@/lib/queries"
import { queryKeys } from "@/lib/query-keys"

/**
 * Rename one project — updates the display name; the slug stays stable so
 * URLs and the MCP `PROJECT_X_PROJECT` binding don't break.
 *
 * Cache contract: push the new project into its detail cache directly
 * (server returns the updated row), and invalidate the active list + the
 * scoped list the slug→id loader binds against so a fresh navigation
 * still resolves the same project.
 */
export function useRenameProject(projectId: string) {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (name: string) =>
			apiPost(apiRoutes.projectRename(projectId), ProjectSchema, { name }),
		onSuccess: (updated) => {
			queryClient.setQueryData(projectQueryOptions(projectId).queryKey, updated)
			void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all })
			void queryClient.invalidateQueries({ queryKey: projectsQueryOptions().queryKey })
		}
	})
}
