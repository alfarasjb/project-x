import type { ReactNode } from "react"
import { useQuery } from "@tanstack/react-query"
import type { Graph } from "@shared/schemas/graph"
import { graphQueryOptions } from "@/lib/queries"
import { GraphEmptyState } from "@/components/graph/empty-state"

/** Centered status line — shared by the loading and error states. */
function Centered({ children }: { children: ReactNode }) {
	return (
		<div className="text-muted-foreground flex h-full items-center justify-center px-6 text-center text-sm">
			{children}
		</div>
	)
}

/**
 * Gates a project's graph-dependent views. Resolves the stored graph and
 * renders the loading / error / not-yet-crawled states itself; on a populated
 * graph it hands it to `children`. Used by both the dashboard and graph routes
 * so the three states are written once.
 */
export function GraphGuard({
	projectId,
	children
}: {
	projectId: string
	children: (graph: Graph) => ReactNode
}) {
	const { data: graph, error, isLoading } = useQuery(graphQueryOptions(projectId))

	if (isLoading) return <Centered>loading…</Centered>
	if (error) {
		return (
			<Centered>
				<span className="text-destructive">couldn&apos;t load the graph — {error.message}</span>
			</Centered>
		)
	}
	// Empty stored graph = never crawled. The graph is DB-backed; only a crawl
	// populates it, so this is the deliberate first-run state.
	if (!graph || graph.nodes.length === 0) return <GraphEmptyState projectId={projectId} />

	return <>{children(graph)}</>
}
