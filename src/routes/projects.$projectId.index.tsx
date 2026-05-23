import { createFileRoute } from "@tanstack/react-router"
import { GraphGuard } from "@/components/project/graph-guard"
import { BlueprintHealth } from "@/components/project/blueprint-health"

export const Route = createFileRoute("/projects/$projectId/")({
	component: DashboardRoute
})

/**
 * The project's main view — blueprint health. The calm landing; the graph
 * canvas lives behind its own tab. Richer panels (change history, audit,
 * drift) land here once the infrastructure they need exists.
 */
function DashboardRoute() {
	const { projectId } = Route.useParams()

	return (
		<GraphGuard projectId={projectId}>
			{(graph) => (
				<div className="h-full overflow-y-auto">
					<div className="mx-auto max-w-4xl px-6 py-6">
						<BlueprintHealth projectId={projectId} graph={graph} />
					</div>
				</div>
			)}
		</GraphGuard>
	)
}
