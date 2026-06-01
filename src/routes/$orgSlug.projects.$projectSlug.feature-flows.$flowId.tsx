import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { FeatureFlowCanvas } from "@/components/feature-flow/feature-flow-canvas"
import {
	projectXAgentFeatureFlowEdges,
	projectXAgentFeatureFlowNodes
} from "@/data/project-x-agent-feature-flow"
import { routes } from "@/lib/routes"

export const Route = createFileRoute("/$orgSlug/projects/$projectSlug/feature-flows/$flowId")({
	component: FeatureFlowCanvasRoute
})

/** Stable id for the hand-authored Project X co-pilot example flow (ARG-25 dev fixture). */
const CO_PILOT_EXAMPLE_ID = "example-co-pilot"

/**
 * Renders an individual feature flow's canvas. A real saved-flow entity
 * isn't wired yet — that arrives with ARG-10 (analyze-time AI distillation)
 * and ARG-11 (agent-drafted flows). Until then, this route only resolves the
 * one hand-authored dev fixture and shows an inline 404 for anything else
 * (no React Router `notFound()` so the user keeps sidebar + project header).
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

	return (
		<div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12">
			<div className="text-muted-foreground text-sm">
				No feature flow with id <span className="font-mono">{flowId}</span>.
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
