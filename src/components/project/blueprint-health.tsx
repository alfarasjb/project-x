import { useQuery } from "@tanstack/react-query"
import type { Graph } from "@shared/schemas/graph"
import { projectQueryOptions } from "@/lib/queries"
import { ALL_LAYERS, LAYER_DOT } from "@/components/graph/node-style"
import { cn } from "@/lib/utils"

/**
 * Blueprint-health summary — the "is this graph in good shape to hand an
 * agent?" panel. Node counts, description coverage, and layer mix are derived
 * from the stored graph; last-crawl time comes from the project summary.
 */
export function BlueprintHealth({ projectId, graph }: { projectId: string; graph: Graph }) {
	const { data: project } = useQuery(projectQueryOptions(projectId))

	const modules = graph.nodes.filter((node) => node.kind === "module")
	const files = graph.nodes.filter((node) => node.kind === "file")
	const describable = modules.length + files.length
	const described =
		modules.filter((node) => node.description !== undefined).length +
		files.filter((node) => node.description !== undefined).length
	const coverage = describable === 0 ? 0 : Math.round((described / describable) * 100)

	const layers = ALL_LAYERS.map((layer) => ({
		layer,
		count: modules.filter((module) => module.layer === layer).length
	})).filter((entry) => entry.count > 0)

	const stats: { label: string; value: string | number }[] = [
		{ label: "Modules", value: modules.length },
		{ label: "Files", value: files.length },
		{ label: "Edges", value: graph.edges.length },
		{ label: "Described", value: `${coverage}%` }
	]

	return (
		<section className="space-y-3">
			<div className="flex items-baseline justify-between gap-3">
				<h2 className="font-display text-sm font-semibold">Blueprint health</h2>
				<span className="text-muted-foreground shrink-0 text-[11px]">
					{project?.lastParsedAt
						? `Crawled ${new Date(project.lastParsedAt).toLocaleString()}`
						: "Not yet crawled"}
				</span>
			</div>

			<div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
				{stats.map((stat) => (
					<div key={stat.label} className="bg-card rounded-lg border px-3 py-2.5">
						<div className="font-display text-xl font-semibold">{stat.value}</div>
						<div className="text-muted-foreground text-[11px]">{stat.label}</div>
					</div>
				))}
			</div>

			<div className="space-y-1.5">
				<div className="bg-muted h-1.5 overflow-hidden rounded-full">
					<div className="bg-primary h-full rounded-full" style={{ width: `${coverage}%` }} />
				</div>
				<p className="text-muted-foreground text-[11px]">
					{described} of {describable} modules + files described
				</p>
			</div>

			{layers.length > 0 && (
				<div className="flex flex-wrap gap-x-3 gap-y-1">
					{layers.map((entry) => (
						<span
							key={entry.layer}
							className="text-muted-foreground flex items-center gap-1.5 text-[11px]"
						>
							<span className={cn("size-2 rounded-sm", LAYER_DOT[entry.layer])} />
							{entry.layer} · {entry.count}
						</span>
					))}
				</div>
			)}
		</section>
	)
}
