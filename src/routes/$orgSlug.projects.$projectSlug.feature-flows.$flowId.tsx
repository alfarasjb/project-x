import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { ArrowLeft } from "lucide-react"
import { FeatureFlowCanvas } from "@/components/feature-flow/feature-flow-canvas"
import { graphToFlow } from "@/components/feature-flow/graph-to-flow"
import {
	projectXAgentFeatureFlowEdges,
	projectXAgentFeatureFlowNodes
} from "@/data/project-x-agent-feature-flow"
import { featureFlowQueryOptions } from "@/lib/queries"
import { routes } from "@/lib/routes"

export const Route = createFileRoute("/$orgSlug/projects/$projectSlug/feature-flows/$flowId")({
	component: FeatureFlowCanvasRoute
})

/** Stable id for the hand-authored Project X co-pilot example flow (ARG-25 dev fixture). */
const CO_PILOT_EXAMPLE_ID = "example-co-pilot"

// Parent does slug → id resolution; read the project id from its loader data.
const parentRoute = getRouteApi(routes.project)

/**
 * Renders an individual feature flow's canvas. Real flows are persisted in the
 * `feature_flows` table and resolved by per-project slug (ARG-26). The one
 * hand-authored co-pilot dev fixture is still served from code under a reserved
 * slug — it predates persistence and has no DB row. Anything else that doesn't
 * resolve shows an inline 404 (no React Router `notFound()` so the user keeps
 * the sidebar + project header).
 */
function FeatureFlowCanvasRoute() {
	const { orgSlug, projectSlug, flowId } = Route.useParams()

	if (flowId === CO_PILOT_EXAMPLE_ID) {
		return (
			<FeatureFlowCanvas
				nodes={projectXAgentFeatureFlowNodes}
				edges={projectXAgentFeatureFlowEdges}
			/>
		)
	}

	return <PersistedFlow orgSlug={orgSlug} projectSlug={projectSlug} flowSlug={flowId} />
}

/** A DB-backed flow, fetched by slug and mapped to the ReactFlow shape. */
function PersistedFlow({
	orgSlug,
	projectSlug,
	flowSlug
}: {
	orgSlug: string
	projectSlug: string
	flowSlug: string
}) {
	const { projectId } = parentRoute.useLoaderData()
	const { data: flow, isPending, isError } = useQuery(featureFlowQueryOptions(projectId, flowSlug))

	if (isPending) {
		return (
			<div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
				Loading flow…
			</div>
		)
	}

	if (isError || !flow) {
		return <FlowNotFound orgSlug={orgSlug} projectSlug={projectSlug} flowSlug={flowSlug} />
	}

	const { nodes, edges } = graphToFlow(flow.graph)
	return <FeatureFlowCanvas nodes={nodes} edges={edges} />
}

function FlowNotFound({
	orgSlug,
	projectSlug,
	flowSlug
}: {
	orgSlug: string
	projectSlug: string
	flowSlug: string
}) {
	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12">
			<div className="text-muted-foreground text-sm">
				No feature flow with id <span className="font-mono">{flowSlug}</span>.
			</div>
			<Link
				to={routes.projectFeatureFlows}
				params={{ orgSlug, projectSlug }}
				className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
			>
				<ArrowLeft className="size-3.5" />
				Back to Feature Flows
			</Link>
		</div>
	)
}
