import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { RefreshCw } from "lucide-react"
import { useCrawlProject } from "@/hooks/use-crawl-project"
import { useCrawlRunStatus } from "@/hooks/use-crawl-run-status"
import {
	graphQueryOptions,
	issuesQueryOptions,
	projectQueryOptions,
	projectsQueryOptions
} from "@/lib/queries"
import { toast, toastError } from "@/lib/toast"
import { cn } from "@/lib/utils"

/**
 * Triggers a crawl of one project. Two code paths land in this one button:
 *
 *   - **Local project** — Fastify parses inline and returns the graph in the
 *     same response. The mutation hook seeds the graph cache; we just toast.
 *   - **GitHub project** — Fastify dispatches a Trigger.dev task and returns
 *     a `runId`. We hold the runId in state, the polling hook hits the
 *     status endpoint every 2s, and an effect handles the terminal
 *     transition: invalidate graph + issues queries on `completed`, toast
 *     on `failed`. The button stays in "Crawling…" until the runId clears.
 */
export function CrawlButton({ projectId }: { projectId: string }) {
	const [runId, setRunId] = useState<string | null>(null)
	const queryClient = useQueryClient()
	const { mutate, isPending } = useCrawlProject(projectId)
	const runStatus = useCrawlRunStatus(runId)

	// Consume the terminal poll. On success we *await the refetch* before
	// clearing the runId — otherwise the button releases while the (stale,
	// pre-crawl-empty) cache is still on screen, and the dashboard briefly
	// shows "Not yet crawled" before the new data lands. Refetch the
	// project row too: `lastParsedAt` lives there, not on the graph, and
	// the header reads it for its "Last crawl …" label.
	useEffect(() => {
		if (!runStatus.data) return
		if (runStatus.data.status === "completed") {
			void Promise.allSettled([
				queryClient.refetchQueries({ queryKey: graphQueryOptions(projectId).queryKey }),
				queryClient.refetchQueries({ queryKey: issuesQueryOptions(projectId).queryKey }),
				queryClient.refetchQueries({ queryKey: projectQueryOptions(projectId).queryKey }),
				queryClient.refetchQueries({ queryKey: projectsQueryOptions().queryKey })
			]).finally(() => {
				setRunId(null)
				toast.success("Crawl complete.")
			})
		} else if (runStatus.data.status === "failed") {
			toastError(new Error(runStatus.data.error ?? "Crawl failed."), "Crawl failed.")
			setRunId(null)
		}
	}, [runStatus.data, queryClient, projectId])

	const onClick = (): void => {
		mutate(undefined, {
			onSuccess: (response) => {
				if (response.kind === "completed") {
					const fileCount = response.graph.nodes.filter((node) => node.kind === "file").length
					toast.success(`Crawl complete — ${fileCount} files parsed.`)
				} else {
					setRunId(response.runId)
				}
			},
			onError: (cause) => toastError(cause, "Crawl failed.")
		})
	}

	const isCrawling = isPending || runId !== null

	return (
		<button
			type="button"
			onClick={onClick}
			disabled={isCrawling}
			className="flex items-center gap-1.5 rounded-md border bg-card/80 px-3 py-1.5 text-xs font-medium backdrop-blur transition-colors hover:bg-card disabled:cursor-not-allowed disabled:opacity-60"
		>
			<RefreshCw className={cn("h-3.5 w-3.5", isCrawling && "animate-spin")} />
			{isCrawling ? "Crawling…" : "Crawl"}
		</button>
	)
}
