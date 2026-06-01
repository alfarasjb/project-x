import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { ArrowRight, Sparkles, Waypoints, Wand2 } from "lucide-react"
import type { FeatureFlowSummary } from "@shared/schemas/feature-flow"
import { featureFlowsQueryOptions } from "@/lib/queries"
import { routes } from "@/lib/routes"

export const Route = createFileRoute("/$orgSlug/projects/$projectSlug/feature-flows/")({
	component: FeatureFlowsListRoute
})

/** Stable id for the hand-authored Project X co-pilot example flow (ARG-25 dev fixture). */
const CO_PILOT_EXAMPLE_ID = "example-co-pilot"

// Parent does slug → id resolution; read the project id from its loader data.
const parentRoute = getRouteApi(routes.project)

/**
 * Feature Flows list — the launching pad for AI-derived per-feature views of
 * the codebase. Two creation paths converge here (both AI-mediated, both
 * intent until ARG-10 / ARG-11 land):
 *
 *   1. **Analyze-time** — AI distills features from the parsed graph and
 *      emits one flow per feature it identifies (ARG-10).
 *   2. **Create-time** — user describes a feature; the agent drafts the flow
 *      and anchors it to the parsed graph (ARG-11).
 *
 * Persistence (ARG-26) is live: saved flows render from the `feature_flows`
 * table in "Your flows". Until the AI paths ship, flows arrive via the seed.
 * The hand-authored co-pilot fixture stays as a dev-only example below.
 */
function FeatureFlowsListRoute() {
	const { orgSlug, projectSlug } = Route.useParams()
	const { projectId } = parentRoute.useLoaderData()
	const { data: flows, isPending } = useQuery(featureFlowsQueryOptions(projectId))

	return (
		<div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-6">
			<header className="flex items-start justify-between gap-4">
				<div>
					<h1 className="font-display text-lg font-semibold tracking-tight">Feature Flows</h1>
					<p className="text-muted-foreground mt-1 text-xs leading-relaxed">
						Per-feature views of how a feature moves through your codebase. Both creation paths are
						AI-mediated and currently intent — they light up when ARG-10 / ARG-11 ship.
					</p>
				</div>
				<button
					type="button"
					disabled
					title="Agent draft surface — lands with ARG-11"
					className="text-muted-foreground inline-flex shrink-0 cursor-not-allowed items-center gap-1.5 rounded-md border border-dashed px-3 py-1.5 text-xs font-medium opacity-70"
				>
					<Wand2 className="size-3.5" />
					Draft with agent
					<span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide">
						intent
					</span>
				</button>
			</header>

			<section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<CreationPathCard
					icon={<Sparkles className="size-3.5" />}
					title="Analyze-time"
					ticket="ARG-10"
					description="AI distills features from the parsed graph and emits one flow per feature it identifies. Runs alongside Analyze."
				/>
				<CreationPathCard
					icon={<Wand2 className="size-3.5" />}
					title="Create-time"
					ticket="ARG-11"
					description="Describe a feature in natural language; the agent drafts the flow and anchors it to the parsed graph. Editable + savable."
				/>
			</section>

			<section className="flex flex-col gap-2">
				<h2 className="text-muted-foreground text-[11px] font-medium uppercase tracking-wide">
					Your flows
				</h2>
				{isPending ? (
					<FlowsPlaceholder text="Loading flows…" />
				) : flows && flows.length > 0 ? (
					<ul className="flex flex-col gap-2">
						{flows.map((flow) => (
							<li key={flow.id}>
								<FlowCard orgSlug={orgSlug} projectSlug={projectSlug} flow={flow} />
							</li>
						))}
					</ul>
				) : (
					<FlowsPlaceholder text="No flows yet — they populate from the seed today, and from analyze-time AI distillation (ARG-10) or agent drafting (ARG-11) once those ship." />
				)}
			</section>

			<section className="border-border flex flex-col gap-2 border-t pt-5">
				<h2 className="text-muted-foreground text-[10px] font-medium uppercase tracking-wide">
					Example (dev · ARG-25 fixture)
				</h2>
				<Link
					to={routes.projectFeatureFlow}
					params={{ orgSlug, projectSlug, flowId: CO_PILOT_EXAMPLE_ID }}
					className="border-border hover:border-foreground/30 hover:bg-muted/40 group flex items-center gap-3 rounded-lg border p-3 transition-colors"
				>
					<div className="bg-muted text-muted-foreground group-hover:text-foreground flex size-8 shrink-0 items-center justify-center rounded-md transition-colors">
						<Waypoints className="size-4" />
					</div>
					<div className="min-w-0 flex-1">
						<div className="text-xs font-medium">Project X co-pilot agent</div>
						<div className="text-muted-foreground mt-0.5 truncate text-[11px]">
							Self-referential — the flow the AI would derive for this project's own future agent.
						</div>
					</div>
					<ArrowRight className="text-muted-foreground group-hover:text-foreground size-3.5 shrink-0 transition-colors" />
				</Link>
			</section>
		</div>
	)
}

/** One saved flow in "Your flows" — links to its canvas by slug. */
function FlowCard({
	orgSlug,
	projectSlug,
	flow
}: {
	orgSlug: string
	projectSlug: string
	flow: FeatureFlowSummary
}) {
	return (
		<Link
			to={routes.projectFeatureFlow}
			params={{ orgSlug, projectSlug, flowId: flow.slug }}
			className="border-border hover:border-foreground/30 hover:bg-muted/40 group flex items-center gap-3 rounded-lg border p-3 transition-colors"
		>
			<div className="bg-muted text-muted-foreground group-hover:text-foreground flex size-8 shrink-0 items-center justify-center rounded-md transition-colors">
				<Waypoints className="size-4" />
			</div>
			<div className="min-w-0 flex-1">
				<div className="text-xs font-medium">{flow.name}</div>
				<div className="text-muted-foreground mt-0.5 truncate text-[11px]">
					{flow.description ?? `${flow.nodeCount} nodes · ${flow.edgeCount} edges`}
				</div>
			</div>
			<ArrowRight className="text-muted-foreground group-hover:text-foreground size-3.5 shrink-0 transition-colors" />
		</Link>
	)
}

/** Dashed placeholder box used for both the loading and empty states. */
function FlowsPlaceholder({ text }: { text: string }) {
	return (
		<div className="border-border bg-card/30 flex flex-col items-center gap-1.5 rounded-lg border border-dashed px-6 py-10 text-center">
			<p className="text-muted-foreground max-w-md text-[11px] leading-relaxed">{text}</p>
		</div>
	)
}

interface CreationPathCardProps {
	icon: React.ReactNode
	title: string
	ticket: string
	description: string
}

/** One of the two AI-mediated creation paths shown side-by-side under the header. */
function CreationPathCard({ icon, title, ticket, description }: CreationPathCardProps) {
	return (
		<div className="border-border bg-card/40 rounded-lg border p-4">
			<div className="flex items-center gap-2 text-xs font-semibold">
				<span className="text-muted-foreground">{icon}</span>
				{title}
				<span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
					{ticket} · intent
				</span>
			</div>
			<p className="text-muted-foreground mt-2 text-[11px] leading-relaxed">{description}</p>
		</div>
	)
}
