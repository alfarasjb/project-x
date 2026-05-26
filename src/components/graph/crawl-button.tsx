import { RefreshCw } from "lucide-react"
import { useCrawlProject } from "@/hooks/use-crawl-project"
import { toast, toastError } from "@/lib/toast"
import { cn } from "@/lib/utils"

/**
 * Triggers a crawl of one project: re-parses its repo server-side, persists the
 * result, and pushes the fresh graph straight into the project's graph cache —
 * no refetch, the crawl response *is* the new graph. Reused in the canvas
 * chrome and in the empty state.
 */
export function CrawlButton({ projectId }: { projectId: string }) {
	const { mutate, isPending } = useCrawlProject(projectId)
	const onClick = (): void => {
		mutate(undefined, {
			onSuccess: (graph) => {
				const fileCount = graph.nodes.filter((node) => node.kind === "file").length
				toast.success(`Crawl complete — ${fileCount} files parsed.`)
			},
			onError: (cause) => toastError(cause, "Crawl failed.")
		})
	}

	return (
		<button
			type="button"
			onClick={onClick}
			disabled={isPending}
			className="flex items-center gap-1.5 rounded-md border bg-card/80 px-3 py-1.5 text-xs font-medium backdrop-blur transition-colors hover:bg-card disabled:cursor-not-allowed disabled:opacity-60"
		>
			<RefreshCw className={cn("h-3.5 w-3.5", isPending && "animate-spin")} />
			{isPending ? "Crawling…" : "Crawl"}
		</button>
	)
}
