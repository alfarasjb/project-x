import { useQuery } from "@tanstack/react-query"
import { apiRoutes } from "@shared/api-routes"
import { CrawlRunStatusSchema } from "@shared/schemas/crawl"
import { apiGet } from "@/lib/api"

/**
 * Poll the status of a Trigger.dev crawl run until it reaches a terminal
 * state. Passing `null` disables the query — the caller flips runId from
 * `null` → `string` when a queued crawl returns, and back to `null` once
 * the polling effect has consumed the terminal state.
 *
 * 2s interval — fast enough to feel responsive, slow enough that a 60s
 * crawl burns ~30 polls (cheap). `refetchInterval: false` halts polling
 * once the run is `completed` or `failed`, so the query goes quiet without
 * the caller needing to disable it manually.
 */
export function useCrawlRunStatus(runId: string | null) {
	return useQuery({
		queryKey: ["crawl-run", runId ?? "idle"],
		queryFn: () => apiGet(apiRoutes.crawlRun(runId as string), CrawlRunStatusSchema),
		enabled: runId !== null,
		refetchInterval: (query) => {
			const status = query.state.data?.status
			if (status === "completed" || status === "failed") return false
			return 2000
		}
	})
}
