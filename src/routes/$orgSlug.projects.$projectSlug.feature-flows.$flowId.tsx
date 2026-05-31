import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { FeatureFlowCanvas } from "@/components/feature-flow/feature-flow-canvas"
import {
	promptwiseFeatureFlowEdges,
	promptwiseFeatureFlowNodes
} from "@/data/promptwise-feature-flow"
import { routes } from "@/lib/routes"

export const Route = createFileRoute("/$orgSlug/projects/$projectSlug/feature-flows/$flowId")({
	component: FeatureFlowCanvasRoute
})

/** Stable id for the hand-authored PromptWise example flow (ARG-25 fixture). */
const PROMPTWISE_EXAMPLE_ID = "example-promptwise"
/** Sentinel id the canvas route treats as "open an empty canvas". */
const NEW_FLOW_ID = "new"

/**
 * Single canvas route shared by the empty "new flow" path and the static
 * example. A real saved-flow entity isn't wired yet (lands in a sibling
 * subissue), so this dispatches on a small set of known `flowId` values and
 * renders an inline 404 for anything else — no React Router `notFound()` so
 * the user keeps the sidebar and project header.
 */
function FeatureFlowCanvasRoute() {
	const { orgSlug, projectSlug, flowId } = Route.useParams()

	if (flowId === NEW_FLOW_ID) {
		return (
			<FeatureFlowCanvas
				nodes={[]}
				edges={[]}
				emptyState="Empty canvas — author nodes / edges to begin. (Editing arrives with the saved-flow entity.)"
			/>
		)
	}

	if (flowId === PROMPTWISE_EXAMPLE_ID) {
		return (
			<FeatureFlowCanvas nodes={promptwiseFeatureFlowNodes} edges={promptwiseFeatureFlowEdges} />
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
