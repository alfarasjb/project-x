import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { ChevronDown, RefreshCcw, Sparkles } from "lucide-react"
import { useAnalyzeProject } from "@/hooks/use-analyze-project"
import { useTaskRunStatus } from "@/hooks/use-task-run-status"
import { graphQueryOptions, issuesQueryOptions, projectQueryOptions } from "@/lib/queries"
import { Button } from "@/components/ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle
} from "@/components/ui/dialog"
import { toast, toastError } from "@/lib/toast"
import { cn } from "@/lib/utils"

/**
 * Runs the AI Analyze pass on a project — classifies + describes every
 * file/module via Claude. Separate from Crawl because it costs money: a
 * user-controlled, dashboard-only action.
 *
 * Two code paths land here, same as CrawlButton:
 *
 *   - **Local project** — Fastify runs the pass inline and returns the
 *     result. Hook seeds the graph cache; we toast and stop.
 *   - **GitHub project** — Fastify dispatches a Trigger.dev task and
 *     returns `{ runId }`. We hold the runId, poll the task-run endpoint
 *     every 2s, and on `completed` refetch graph + issues + project
 *     before releasing — same anti-flicker pattern as crawl.
 *
 * Split-button shape: primary click runs the cheap default (skip
 * unchanged); chevron opens a menu with "Re-analyze all" (force=true,
 * gated by a confirm modal — users reach for re-analyze expecting
 * refresh semantics and find an LLM bill instead).
 *
 * Dropdown uses the same transparent click-catcher pattern as
 * ProjectSwitcher / AddProjectMenu rather than shadcn's dropdown-menu.
 */
export function AnalyzeButton({ projectId }: { projectId: string }) {
	const [menuOpen, setMenuOpen] = useState(false)
	const [confirmOpen, setConfirmOpen] = useState(false)
	const [runId, setRunId] = useState<string | null>(null)
	const queryClient = useQueryClient()
	const { mutate, isPending } = useAnalyzeProject(projectId)
	const runStatus = useTaskRunStatus(runId)

	// Consume the terminal poll. On success we *await the refetch* before
	// clearing the runId — same anti-flicker pattern as crawl. The trigger
	// task wrote new descriptions/classifications + similarity issues +
	// `lastParsedAt`, so we refetch graph + issues + project.
	useEffect(() => {
		if (!runStatus.data) return
		if (runStatus.data.status === "completed") {
			void Promise.allSettled([
				queryClient.refetchQueries({ queryKey: graphQueryOptions(projectId).queryKey }),
				queryClient.refetchQueries({ queryKey: issuesQueryOptions(projectId).queryKey }),
				queryClient.refetchQueries({ queryKey: projectQueryOptions(projectId).queryKey })
			]).finally(() => {
				setRunId(null)
				toast.success("Analyze complete.")
			})
		} else if (runStatus.data.status === "failed") {
			toastError(new Error(runStatus.data.error ?? "Analyze failed."), "Analyze failed.")
			setRunId(null)
		}
	}, [runStatus.data, queryClient, projectId])

	const runAnalyze = (force: boolean): void => {
		mutate(force, {
			onSuccess: (response) => {
				if (response.kind === "completed") {
					const result = response.result
					const parts = [`${result.analyzed} analyzed`]
					if (result.skipped > 0) parts.push(`${result.skipped} skipped`)
					if (result.failed > 0) parts.push(`${result.failed} failed`)
					toast.success(`Analyze complete — ${parts.join(" · ")}.`)
				} else {
					setRunId(response.runId)
				}
			},
			onError: (cause) => toastError(cause, "Analyze failed.")
		})
	}

	const openConfirm = (): void => {
		setMenuOpen(false)
		setConfirmOpen(true)
	}

	const runForce = (): void => {
		setConfirmOpen(false)
		runAnalyze(true)
	}

	const isAnalyzing = isPending || runId !== null

	return (
		<div className="flex flex-col items-end gap-1">
			<div className="relative inline-flex">
				<button
					type="button"
					onClick={() => runAnalyze(false)}
					disabled={isAnalyzing}
					className="border-primary/40 bg-primary/90 text-primary-foreground hover:bg-primary flex items-center gap-1.5 rounded-l-md border border-r-0 px-3 py-1.5 text-xs font-medium backdrop-blur transition-all disabled:cursor-not-allowed disabled:opacity-60"
				>
					<Sparkles className={cn("h-3.5 w-3.5", isAnalyzing && "animate-pulse")} />
					{isAnalyzing ? "Analyzing…" : "Analyze"}
				</button>
				<button
					type="button"
					onClick={() => setMenuOpen((value) => !value)}
					disabled={isAnalyzing}
					aria-label="More analyze options"
					aria-haspopup="menu"
					aria-expanded={menuOpen}
					className="border-primary/40 bg-primary/90 text-primary-foreground hover:bg-primary flex items-center rounded-r-md border px-1.5 py-1.5 backdrop-blur transition-all disabled:cursor-not-allowed disabled:opacity-60"
				>
					<ChevronDown className="size-3.5" />
				</button>

				{menuOpen && (
					<>
						{/* Click-catcher closes the menu without needing a ref/effect. */}
						<div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
						<div
							role="menu"
							className="bg-card absolute right-0 top-full z-30 mt-1 w-56 rounded-md border p-1 shadow-md"
						>
							<button
								type="button"
								role="menuitem"
								onClick={openConfirm}
								className="hover:bg-muted flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors"
							>
								<RefreshCcw className="mt-0.5 size-3.5 shrink-0" />
								<span className="min-w-0">
									<div className="font-medium">Re-analyze all</div>
									<div className="text-muted-foreground text-[10px] leading-snug">
										Ignore the unchanged-file skip. Costs the full LLM bill.
									</div>
								</span>
							</button>
						</div>
					</>
				)}
			</div>

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
