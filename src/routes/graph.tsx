import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { GraphCanvas } from "@/components/graph/graph-canvas"
import { graphQueryOptions } from "@/lib/queries"
import { seedGraph } from "@/data/seed-graph"

export const Route = createFileRoute("/graph")({
	component: GraphPage,
	loader: ({ context }) => {
		// Fire-and-forget: warms the cache so the query has data sooner. A parser
		// failure is surfaced in the component (degrades to the seed), not the
		// route error boundary — `prefetchQuery` never rejects.
		void context.queryClient.prefetchQuery(graphQueryOptions())
	}
})

function GraphPage() {
	const { data: graph, error, isLoading } = useQuery(graphQueryOptions())

	if (isLoading) {
		return (
			<div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
				parsing the repo…
			</div>
		)
	}

	return (
		<div className="relative h-screen w-full">
			<GraphCanvas graph={graph ?? seedGraph} />
			<Link
				to="/"
				className="absolute right-4 top-4 z-10 rounded-md border bg-card/80 px-3 py-1.5 text-xs font-medium backdrop-blur hover:bg-card"
			>
				← Home
			</Link>
			{error && (
				<div className="text-destructive absolute bottom-4 left-4 z-10 rounded-md border bg-card/80 px-3 py-1.5 text-xs backdrop-blur">
					parser unavailable — showing the seed ({error.message})
				</div>
			)}
		</div>
	)
}
