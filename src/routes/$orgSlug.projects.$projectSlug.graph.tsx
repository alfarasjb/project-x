import { createFileRoute, getRouteApi } from "@tanstack/react-router"
import { GraphCanvas } from "@/components/graph/graph-canvas"
import { GraphGuard } from "@/components/project/graph-guard"

// Parent does slug → id resolution; read the id from its loader data.
const parentRoute = getRouteApi("/$orgSlug/projects/$projectSlug")

export const Route = createFileRoute("/$orgSlug/projects/$projectSlug/graph")({
	component: GraphRoute
})

/** The graph canvas view — one tab of the project, no longer the landing. */
function GraphRoute() {
	const { projectId } = parentRoute.useLoaderData()

	return <GraphGuard projectId={projectId}>{(graph) => <GraphCanvas graph={graph} />}</GraphGuard>
}
