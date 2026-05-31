import { createFileRoute, Link } from "@tanstack/react-router"
import { ArrowRight, Plus, Waypoints } from "lucide-react"
import { routes } from "@/lib/routes"

export const Route = createFileRoute("/$orgSlug/projects/$projectSlug/feature-flows/")({
	component: FeatureFlowsListRoute
})

/** Stable id for the hand-authored PromptWise example flow (ARG-25 fixture). */
const PROMPTWISE_EXAMPLE_ID = "example-promptwise"
/** Sentinel id the canvas route treats as "open an empty canvas". */
const NEW_FLOW_ID = "new"

/**
 * Feature Flows list — placeholder for the saved-flows entity that lands in
 * a sibling subissue. For now it surfaces the two scaffold entry points:
 * the static PromptWise example (the ARG-25 acceptance fixture) and a "new
 * flow" link that opens an empty canvas.
 */
function FeatureFlowsListRoute() {
	const { orgSlug, projectSlug } = Route.useParams()

	return (
		<div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-6">
			<header className="flex items-start justify-between gap-4">
				<div>
					<h1 className="font-display text-lg font-semibold tracking-tight">Feature Flows</h1>
					<p className="text-muted-foreground mt-1 text-xs leading-relaxed">
						A feature flow is a layered, action-triggered traversal of the architecture — how a
						feature *moves* through the codebase. Saved flows arrive in the next slice; for now this
						page renders the PromptWise reference example so we can validate the canvas before any
						AI work lands.
					</p>
				</div>
				<Link
					to={routes.projectFeatureFlow}
					params={{ orgSlug, projectSlug, flowId: NEW_FLOW_ID }}
					className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
				>
					<Plus className="size-3.5" />
					New flow
				</Link>
			</header>

			<section className="flex flex-col gap-2">
				<h2 className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
					Examples
				</h2>
				<Link
					to={routes.projectFeatureFlow}
					params={{ orgSlug, projectSlug, flowId: PROMPTWISE_EXAMPLE_ID }}
					className="border-border bg-card hover:border-foreground/30 hover:bg-muted/40 group flex items-center gap-3 rounded-lg border p-4 transition-colors"
				>
					<div className="bg-muted text-muted-foreground group-hover:text-foreground flex size-9 shrink-0 items-center justify-center rounded-md transition-colors">
						<Waypoints className="size-4" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="text-sm font-medium">PromptWise video dispatch</div>
						<div className="text-muted-foreground mt-0.5 truncate text-xs">
							Hand-authored fixture mirroring{" "}
							<span className="font-mono">startVideoGeneration</span> (PRO-1066) — the ARG-25 /
							ARG-11 acceptance target.
						</div>
					</div>
					<ArrowRight className="text-muted-foreground group-hover:text-foreground size-4 shrink-0 transition-colors" />
				</Link>
			</section>

			<section className="flex flex-col gap-2">
				<h2 className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
					Saved flows
				</h2>
				<div className="border-border text-muted-foreground rounded-lg border border-dashed px-4 py-8 text-center text-xs">
					No saved feature flows yet. The saved-flow entity arrives in the next slice.
				</div>
			</section>
		</div>
	)
}
