import type { ReactNode } from "react"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { GraphCanvas } from "@/components/graph/graph-canvas"
import { GraphEmptyState } from "@/components/graph/empty-state"
import { CrawlButton } from "@/components/graph/crawl-button"
import { graphQueryOptions } from "@/lib/queries"

export const Route = createFileRoute("/projects/$projectId")({
	component: GraphPage,
	loader: ({ context, params }) => {
		// Fire-and-forget: warms the cache so the canvas paints without a fetch
		// waterfall. `prefetchQuery` never rejects — load failures surface below.
		void context.queryClient.prefetchQuery(graphQueryOptions(params.projectId))
	}
})

/** Full-screen centered message — the loading and error states share this frame. */
function CenteredMessage({ children }: { children: ReactNode }) {
	return (
		<div className="text-muted-foreground flex h-screen items-center justify-center px-6 text-center text-sm">
			{children}
		</div>
	)
}

function GraphPage() {
	const { projectId } = Route.useParams()
	const { data: graph, error, isLoading } = useQuery(graphQueryOptions(projectId))

	if (isLoading) {
		return <CenteredMessage>loading graph…</CenteredMessage>
	}

	if (error) {
		return (
			<CenteredMessage>
				<span className="text-destructive">couldn&apos;t load the graph — {error.message}</span>
			</CenteredMessage>
		)
	}

	// Empty stored graph = never crawled. The graph is DB-backed and only a
	// crawl populates it; we never parse on load.
	if (!graph || graph.nodes.length === 0) {
		return <GraphEmptyState projectId={projectId} />
	}

	return (
		<div className="relative h-screen w-full">
			<GraphCanvas graph={graph} />
			<div className="absolute left-4 top-4 z-10">
				<CrawlButton projectId={projectId} />
			</div>
			<Link
				to="/"
				className="absolute right-4 top-4 z-10 rounded-md border bg-card/80 px-3 py-1.5 text-xs font-medium backdrop-blur hover:bg-card"
			>
				← Projects
			</Link>
		</div>
	)
}
