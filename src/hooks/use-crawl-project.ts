import { useMutation, useQueryClient } from "@tanstack/react-query"
import { apiRoutes } from "@shared/api-routes"
import { CrawlResponseSchema } from "@shared/schemas/crawl"
import { apiPost } from "@/lib/api"
import { graphQueryOptions, issuesQueryOptions } from "@/lib/queries"

/**
 * Crawl one project. The server returns a discriminated `CrawlResponse`:
 *
 *   - `kind: "completed"` for local-rootPath projects parsed inline. The
 *     hook seeds the graph cache directly + invalidates issues so the UI
 *     reflects the new state without a refetch.
 *   - `kind: "queued"` for GitHub-imported projects. A Trigger.dev task is
 *     running on a worker; the caller takes the `runId` and polls
 *     `useCrawlRunStatus` until completion, at which point IT invalidates
 *     graph + issues queries. The hook is intentionally a no-op for the
 *     queued case — cache state isn't valid to touch until the task lands.
 *
 * Components branch on `response.kind` to wire UI side-effects (toast,
 * progress indicator) via `mutate(undefined, { onSuccess })`.
 */
export function useCrawlProject(projectId: string) {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: () => apiPost(apiRoutes.projectCrawl(projectId), CrawlResponseSchema),
		onSuccess: (response) => {
			if (response.kind !== "completed") return
			queryClient.setQueryData(graphQueryOptions(projectId).queryKey, response.graph)
			void queryClient.invalidateQueries({ queryKey: issuesQueryOptions(projectId).queryKey })
		}
	})
}
