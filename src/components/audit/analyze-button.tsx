import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { RefreshCcw, Sparkles } from "lucide-react"
import { AnalyzeResultSchema } from "@shared/schemas/graph"
import { apiPost } from "@/lib/api"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle
} from "@/components/ui/dialog"
import { graphQueryOptions, issuesQueryOptions } from "@/lib/queries"
import { cn } from "@/lib/utils"

/**
 * Runs the AI Analyze pass on a project — classifies + describes every
 * file/module via Claude. Separate from Crawl because it costs money: a
 * user-controlled, dashboard-only action.
 *
 * Two modes:
 *   - **Analyze** (default) skips files whose content hash matches the last
 *     analyzed hash. Fast and cheap on a stable codebase; only changed +
 *     unclassified files cost LLM calls.
 *   - **Re-analyze all** forces a full pass, ignoring the hash dedup. This
 *     is the full bill — gated by a confirm modal because users will reach
 *     for it expecting "refresh" semantics and find a $5 charge instead.
 *     Manual descriptions are still preserved in either mode.
 *
 * Lives next to the Issue Feed because classifications are what
 * classification-aware rules (boundary violations, coming next) will key
 * on. Today the visible effect is per-node descriptions appearing in the
 * inspector chip; the Issue Feed itself won't change in kind until the
 * next audit-rules PR lands.
 */
export function AnalyzeButton({ projectId }: { projectId: string }) {
	const [confirmOpen, setConfirmOpen] = useState(false)
	const queryClient = useQueryClient()
	const { mutate, isPending, error, data } = useMutation({
		mutationFn: (force: boolean) =>
			apiPost(`/api/projects/${projectId}/analyze`, AnalyzeResultSchema, { force }),
		onSuccess: (result) => {
			queryClient.setQueryData(graphQueryOptions(projectId).queryKey, result.graph)
			void queryClient.invalidateQueries({ queryKey: issuesQueryOptions(projectId).queryKey })
		}
	})

	const runForce = (): void => {
		setConfirmOpen(false)
		mutate(true)
	}

	return (
		<div className="flex flex-col items-end gap-1">
			<div className="flex items-center gap-1">
				<button
					type="button"
					onClick={() => mutate(false)}
					disabled={isPending}
					className="flex items-center gap-1.5 rounded-md border bg-card/80 px-3 py-1.5 text-xs font-medium backdrop-blur transition-colors hover:bg-card disabled:cursor-not-allowed disabled:opacity-60"
				>
					<Sparkles className={cn("h-3.5 w-3.5", isPending && "animate-pulse")} />
					{isPending ? "Analyzing…" : "Analyze"}
				</button>
				<button
					type="button"
					onClick={() => setConfirmOpen(true)}
					disabled={isPending}
					title="Re-analyze every file, ignoring the unchanged-file skip. Costs the full LLM bill."
					className="text-muted-foreground hover:text-foreground flex items-center gap-1 rounded-md border bg-card/80 px-2 py-1.5 text-[11px] backdrop-blur transition-colors hover:bg-card disabled:cursor-not-allowed disabled:opacity-60"
				>
					<RefreshCcw className="h-3 w-3" />
					Re-analyze all
				</button>
			</div>
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

			<Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Re-analyze the entire codebase?</DialogTitle>
						<DialogDescription>
							This bypasses the unchanged-file skip and sends every file + module to Claude. It will
							be slow and expensive — every node pays the full LLM cost, even ones already analyzed.
							Manual descriptions are still preserved.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setConfirmOpen(false)}>
							Cancel
						</Button>
						<Button onClick={runForce}>Continue</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
