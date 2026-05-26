import { useQuery } from "@tanstack/react-query"
import { apiRoutes } from "@shared/api-routes"
import { TaskRunStatusSchema } from "@shared/schemas/crawl"
import { apiGet } from "@/lib/api"

/**
 * Poll the status of any Trigger.dev task run (crawl, analyze, future
 * handlers) until it reaches a terminal state. Passing `null` disables the
 * query — the caller flips runId from `null` → `string` when a queued task
 * returns, and back to `null` once the polling effect has consumed the
 * terminal state.
 *
 * 2s interval — fast enough to feel responsive, slow enough that a 60s
 * task burns ~30 polls (cheap). `refetchInterval: false` halts polling
 * once the run is `completed` or `failed`, so the query goes quiet without
 * the caller needing to disable it manually.
 */
export function useTaskRunStatus(runId: string | null) {
	return useQuery({
		queryKey: ["task-run", runId ?? "idle"],
		queryFn: () => apiGet(apiRoutes.taskRun(runId as string), TaskRunStatusSchema),
		enabled: runId !== null,
		refetchInterval: (query) => {
			const status = query.state.data?.status
			if (status === "completed" || status === "failed") return false
			return 2000
		}
	})
}
