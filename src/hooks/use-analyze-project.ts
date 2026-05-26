import { useMutation, useQueryClient } from "@tanstack/react-query"
import { apiRoutes } from "@shared/api-routes"
import { AnalyzeResponseSchema } from "@shared/schemas/crawl"
import { apiPost } from "@/lib/api"
import { graphQueryOptions, issuesQueryOptions } from "@/lib/queries"

/**
 * Run AI Analyze on a project — classifies + describes every file/module
 * via Claude. Mutation input is `force: boolean` (true bypasses the
 * unchanged-file skip and re-runs every node — slow + expensive).
 *
 * Server returns a discriminated `AnalyzeResponse`:
 *
 *   - `kind: "completed"` for local-rootPath projects analyzed inline.
 *     The hook seeds the graph cache directly + invalidates issues so the
 *     UI reflects the new state without a refetch.
 *   - `kind: "queued"` for GitHub-imported projects. A Trigger.dev task
 *     is running on a worker; the caller takes the `runId` and polls
 *     `useTaskRunStatus` until completion, at which point IT invalidates
 *     graph + issues queries. The hook is a no-op for the queued case —
 *     cache state isn't valid to touch until the task lands.
 */
export function useAnalyzeProject(projectId: string) {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: (force: boolean) =>
			apiPost(apiRoutes.projectAnalyze(projectId), AnalyzeResponseSchema, { force }),
		onSuccess: (response) => {
			if (response.kind !== "completed") return
			queryClient.setQueryData(graphQueryOptions(projectId).queryKey, response.result.graph)
			void queryClient.invalidateQueries({ queryKey: issuesQueryOptions(projectId).queryKey })
		}
	})
}
