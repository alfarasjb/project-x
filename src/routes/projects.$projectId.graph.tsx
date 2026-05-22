import { createFileRoute } from "@tanstack/react-router"
import { GraphCanvas } from "@/components/graph/graph-canvas"
import { GraphGuard } from "@/components/project/graph-guard"

export const Route = createFileRoute("/projects/$projectId/graph")({
	component: GraphRoute
})

/** The graph canvas view — one tab of the project, no longer the landing. */
function GraphRoute() {
	const { projectId } = Route.useParams()

	return <GraphGuard projectId={projectId}>{(graph) => <GraphCanvas graph={graph} />}</GraphGuard>
}
