import { useState } from "react"
import { ChevronDown, RefreshCcw, Sparkles } from "lucide-react"
import { useAnalyzeProject } from "@/hooks/use-analyze-project"
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
 * Split-button shape: the primary click runs the cheap default (skip
 * unchanged files); the chevron opens a dropdown with the destructive
 * "Re-analyze all" option. That secondary action is still gated by a
 * confirm modal — users reach for "re-analyze" expecting refresh
 * semantics and find an LLM bill instead.
 *
 * Lives in the IssueStats strip at the top of the dashboard. The dropdown
 * uses the same transparent click-catcher pattern as ProjectSwitcher
 * rather than installing shadcn's dropdown-menu — one fewer dep.
 */
export function AnalyzeButton({ projectId }: { projectId: string }) {
	const [menuOpen, setMenuOpen] = useState(false)
	const [confirmOpen, setConfirmOpen] = useState(false)
	const { mutate, isPending } = useAnalyzeProject(projectId)

	const runAnalyze = (force: boolean): void => {
		mutate(force, {
			onSuccess: (result) => {
				const parts = [`${result.analyzed} analyzed`]
				if (result.skipped > 0) parts.push(`${result.skipped} skipped`)
				if (result.failed > 0) parts.push(`${result.failed} failed`)
				toast.success(`Analyze complete — ${parts.join(" · ")}.`)
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

	return (
		<div className="flex flex-col items-end gap-1">
			<div className="relative inline-flex">
				<button
					type="button"
					onClick={() => runAnalyze(false)}
					disabled={isPending}
					className="bg-card/80 hover:bg-card flex items-center gap-1.5 rounded-l-md border border-r-0 px-3 py-1.5 text-xs font-medium backdrop-blur transition-colors disabled:cursor-not-allowed disabled:opacity-60"
				>
					<Sparkles className={cn("h-3.5 w-3.5", isPending && "animate-pulse")} />
					{isPending ? "Analyzing…" : "Analyze"}
				</button>
				<button
					type="button"
					onClick={() => setMenuOpen((value) => !value)}
					disabled={isPending}
					aria-label="More analyze options"
					aria-haspopup="menu"
					aria-expanded={menuOpen}
					className="bg-card/80 hover:bg-card flex items-center rounded-r-md border px-1.5 py-1.5 backdrop-blur transition-colors disabled:cursor-not-allowed disabled:opacity-60"
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
