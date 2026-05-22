import { useMutation, useQueryClient } from "@tanstack/react-query"
import { RefreshCw } from "lucide-react"
import { GraphSchema } from "@shared/schemas/graph"
import { apiPost } from "@/lib/api"
import { graphQueryOptions } from "@/lib/queries"
import { cn } from "@/lib/utils"

/**
 * Triggers a repo crawl: re-parses the codebase server-side, persists the
 * result, and pushes the fresh graph straight into the `["graph"]` cache — no
 * refetch, the crawl response *is* the new graph. Reused in the canvas chrome
 * and in the empty state; only one instance is mounted at a time.
 */
export function CrawlButton() {
	const queryClient = useQueryClient()
	const { mutate, isPending, error } = useMutation({
		mutationFn: () => apiPost("/api/graph/crawl", GraphSchema),
		onSuccess: (graph) => {
			queryClient.setQueryData(graphQueryOptions().queryKey, graph)
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
