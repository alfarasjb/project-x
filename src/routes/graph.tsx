import { createFileRoute, Link } from "@tanstack/react-router"
import { GraphCanvas } from "@/components/graph/graph-canvas"
import { seedGraph } from "@/data/seed-graph"

export const Route = createFileRoute("/graph")({
	component: GraphPage
})

function GraphPage() {
	return (
		<div className="relative h-screen w-full">
			<GraphCanvas graph={seedGraph} />
			<Link
				to="/"
				className="absolute right-4 top-4 z-10 rounded-md border bg-card/80 px-3 py-1.5 text-xs font-medium backdrop-blur hover:bg-card"
			>
				← Home
			</Link>
		</div>
	)
}
