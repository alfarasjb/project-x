import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { GraphSchema, type Graph } from "@shared/schemas/graph"
import { GraphCanvas } from "@/components/graph/graph-canvas"
import { layoutGraph } from "@/components/graph/layout"
import { seedGraph } from "@/data/seed-graph"

export const Route = createFileRoute("/graph")({
	component: GraphPage
})

function GraphPage() {
	const [graph, setGraph] = useState<Graph | null>(null)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		fetch("/api/graph")
			.then((res) => res.json())
			.then((data) => setGraph(layoutGraph(GraphSchema.parse(data))))
			.catch((e: unknown) => {
				setError(e instanceof Error ? e.message : "failed to parse the repo")
				setGraph(layoutGraph(seedGraph)) // fall back to the seed
			})
	}, [])

	if (!graph) {
		return (
			<div className="flex h-screen items-center justify-center text-sm text-muted-foreground">
				parsing the repo…
			</div>
		)
	}

	return (
		<div className="relative h-screen w-full">
			<GraphCanvas graph={graph} />
			<Link
				to="/"
				className="absolute right-4 top-4 z-10 rounded-md border bg-card/80 px-3 py-1.5 text-xs font-medium backdrop-blur hover:bg-card"
			>
				← Home
			</Link>
			{error && (
				<div className="text-destructive absolute bottom-4 left-4 z-10 rounded-md border bg-card/80 px-3 py-1.5 text-xs backdrop-blur">
					parser unavailable — showing the seed ({error})
				</div>
			)}
		</div>
	)
}
