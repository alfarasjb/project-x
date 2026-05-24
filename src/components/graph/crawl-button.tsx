import { useMutation, useQueryClient } from "@tanstack/react-query"
import { RefreshCw } from "lucide-react"
import { apiRoutes } from "@shared/api-routes"
import { GraphSchema } from "@shared/schemas/graph"
import { apiPost } from "@/lib/api"
import { graphQueryOptions, issuesQueryOptions } from "@/lib/queries"
import { cn } from "@/lib/utils"

/**
 * Triggers a crawl of one project: re-parses its repo server-side, persists the
 * result, and pushes the fresh graph straight into the project's graph cache —
 * no refetch, the crawl response *is* the new graph. Reused in the canvas
 * chrome and in the empty state.
 */
export function CrawlButton({ projectId }: { projectId: string }) {
	const queryClient = useQueryClient()
	const { mutate, isPending, error } = useMutation({
		mutationFn: () => apiPost(apiRoutes.projectCrawl(projectId), GraphSchema),
		onSuccess: (graph) => {
			queryClient.setQueryData(graphQueryOptions(projectId).queryKey, graph)
			// The crawl also rewrote the audit issues — refetch them so the feed
			// reflects the new findings (we don't get them in the crawl response).
			void queryClient.invalidateQueries({ queryKey: issuesQueryOptions(projectId).queryKey })
		}
	})

	return (
		<div className="flex flex-col items-start gap-1">
			<button
				type="button"
				onClick={() => mutate()}
				disabled={isPending}
				className="flex items-center gap-1.5 rounded-md border bg-card/80 px-3 py-1.5 text-xs font-medium backdrop-blur transition-colors hover:bg-card disabled:cursor-not-allowed disabled:opacity-60"
			>
				<RefreshCw className={cn("h-3.5 w-3.5", isPending && "animate-spin")} />
				{isPending ? "Crawling…" : "Crawl"}
			</button>
			{error && (
				<span className="text-destructive max-w-64 rounded border bg-card/80 px-2 py-1 text-[11px] backdrop-blur">
					crawl failed — {error.message}
				</span>
			)}
		</div>
	)
}
