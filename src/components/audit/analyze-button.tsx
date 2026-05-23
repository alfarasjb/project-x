import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Sparkles } from "lucide-react"
import { AnalyzeResultSchema } from "@shared/schemas/graph"
import { apiPost } from "@/lib/api"
import { graphQueryOptions, issuesQueryOptions } from "@/lib/queries"
import { cn } from "@/lib/utils"

/**
 * Runs the AI Analyze pass on a project — classifies + describes every
 * file/module via Claude. Separate from Crawl because it costs money: a
 * user-controlled, dashboard-only action.
 *
 * Lives next to the Issue Feed because classifications are what
 * classification-aware rules (e.g. boundary violations, coming next) will
 * key on. Today the visible effect is per-node descriptions appearing in
 * the inspector chip; the Issue Feed itself won't change in kind until the
 * next audit-rules PR lands.
 */
export function AnalyzeButton({ projectId }: { projectId: string }) {
	const queryClient = useQueryClient()
	const { mutate, isPending, error, data } = useMutation({
		mutationFn: () => apiPost(`/api/projects/${projectId}/analyze`, AnalyzeResultSchema),
		onSuccess: (result) => {
			queryClient.setQueryData(graphQueryOptions(projectId).queryKey, result.graph)
			void queryClient.invalidateQueries({ queryKey: issuesQueryOptions(projectId).queryKey })
		}
	})

	return (
		<div className="flex flex-col items-end gap-1">
			<button
				type="button"
				onClick={() => mutate()}
				disabled={isPending}
				className="flex items-center gap-1.5 rounded-md border bg-card/80 px-3 py-1.5 text-xs font-medium backdrop-blur transition-colors hover:bg-card disabled:cursor-not-allowed disabled:opacity-60"
			>
				<Sparkles className={cn("h-3.5 w-3.5", isPending && "animate-pulse")} />
				{isPending ? "Analyzing…" : "Analyze"}
			</button>
			{error && (
				<span className="text-destructive max-w-64 rounded border bg-card/80 px-2 py-1 text-right text-[11px] backdrop-blur">
					analyze failed — {error.message}
				</span>
			)}
			{!error && data && !isPending && (
				<span className="text-muted-foreground text-[11px]">
					{data.analyzed} analyzed · {data.skipped} skipped
					{data.failed > 0 ? ` · ${data.failed} failed` : ""}
				</span>
			)}
		</div>
	)
}
