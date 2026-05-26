import { useMutation, useQueryClient } from "@tanstack/react-query"
import { apiRoutes } from "@shared/api-routes"
import { GraphSchema } from "@shared/schemas/graph"
import { apiPost } from "@/lib/api"
import { graphQueryOptions, issuesQueryOptions } from "@/lib/queries"

/**
 * Crawl one project — re-parse its repo server-side, persist the result,
 * and push the fresh graph straight into the project's graph cache. The
 * crawl response IS the new graph, so we `setQueryData` instead of
 * refetching. Issues are rewritten server-side too but not returned;
 * invalidate them so the feed picks up the new findings.
 */
export function useCrawlProject(projectId: string) {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: () => apiPost(apiRoutes.projectCrawl(projectId), GraphSchema),
		onSuccess: (graph) => {
			queryClient.setQueryData(graphQueryOptions(projectId).queryKey, graph)
			void queryClient.invalidateQueries({ queryKey: issuesQueryOptions(projectId).queryKey })
		}
	})
}
