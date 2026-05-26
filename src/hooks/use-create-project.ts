import { useMutation, useQueryClient } from "@tanstack/react-query"
import { apiRoutes } from "@shared/api-routes"
import { type CreateProject, ProjectSchema } from "@shared/schemas/project"
import { apiPost } from "@/lib/api"
import { projectsQueryOptions } from "@/lib/queries"
import { queryKeys } from "@/lib/query-keys"

/**
 * Create a project — local path or GitHub repo, switched by the discriminated
 * `source` field on the input. The hook owns the cache contract: on success
 * it seeds the active-list cache with the new row so the project route's
 * slug→id loader finds it immediately on navigation (`invalidateQueries`
 * alone refetches lazily and loses the race → 404).
 *
 * Components wire UI-only concerns (toast, navigate, dialog close) by
 * passing `onSuccess` / `onError` to `mutate(input, { ... })`.
 */
export function useCreateProject() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (input: CreateProject) => apiPost(apiRoutes.projectsList, ProjectSchema, input),
		onSuccess: (project) => {
			queryClient.setQueryData(projectsQueryOptions().queryKey, (prev) =>
				prev ? [project, ...prev] : [project]
			)
			void queryClient.invalidateQueries({ queryKey: queryKeys.projects.all })
		}
	})
}
