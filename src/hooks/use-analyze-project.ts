import { useMutation, useQueryClient } from "@tanstack/react-query"
import { apiRoutes } from "@shared/api-routes"
import { AnalyzeResultSchema } from "@shared/schemas/graph"
import { apiPost } from "@/lib/api"
import { graphQueryOptions, issuesQueryOptions } from "@/lib/queries"

/**
 * Run AI Analyze on a project — classifies + describes every file/module
 * via Claude. Mutation input is `force: boolean` (true bypasses the
 * unchanged-file skip and re-runs every node — slow + expensive).
 *
 * Hook owns the cache contract: push the new graph in directly (the
 * response carries it) and invalidate issues since heuristic findings can
 * shift after fresh classifications.
 */
export function useAnalyzeProject(projectId: string) {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (force: boolean) =>
			apiPost(apiRoutes.projectAnalyze(projectId), AnalyzeResultSchema, { force }),
		onSuccess: (result) => {
			queryClient.setQueryData(graphQueryOptions(projectId).queryKey, result.graph)
			void queryClient.invalidateQueries({ queryKey: issuesQueryOptions(projectId).queryKey })
		}
	})
}
