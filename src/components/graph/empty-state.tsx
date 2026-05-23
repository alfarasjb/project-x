import { CrawlButton } from "@/components/graph/crawl-button"

/**
 * Shown at `/projects/:id` when the project has never been crawled — its stored
 * graph is empty. The graph only appears after an explicit crawl; we never
 * crawl on load, so this is the deliberate first-run state.
 */
export function GraphEmptyState({ projectId }: { projectId: string }) {
	return (
		<div className="flex h-full w-full flex-col items-center justify-center gap-5 text-center">
			<div className="max-w-sm space-y-1.5">
				<h2 className="font-display text-lg font-semibold">No graph yet</h2>
				<p className="text-muted-foreground text-sm">
					Crawl this repository to parse its modules, files, and dependencies into the architecture
					graph. It persists — later visits load instantly from the database.
				</p>
			</div>
			<CrawlButton projectId={projectId} />
		</div>
	)
}
