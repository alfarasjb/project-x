import type { Graph, GraphNode, NodeClassification } from "@shared/schemas/graph"
import type { Issue } from "@shared/schemas/issue"

/**
 * Boundary violation rule — flags file-to-file imports that cross an
 * architectural layer they shouldn't. Operates on classification pairs
 * (source → target), so it's framework-agnostic: a route that imports a
 * repo directly is flagged whether you use Fastify, Express, Next, or
 * anything else. The forbidden-pair matrix is a small set of widely-held
 * conventions; tune as needed.
 *
 * Scoped to file→file edges only. Module-level edges (rolled up from
 * file edges) would re-flag the same problem at a coarser grain.
 * Symbol-level edges don't exist yet (parser builds an import graph only,
 * not a call graph) so we can't catch function-to-function violations.
 *
 * Issues are grouped per SOURCE file — one card per file with a list of
 * offending targets — so a router with five forbidden imports shows as
 * one issue, not five.
 */

/**
 * Forbidden cross-classification edges. `{source}→{target}` means: a
 * `source`-classified file should not import a `target`-classified file
 * directly. The default matrix encodes patterns that hold across stacks:
 *
 *   - routing → data-access     route handler reaching past the domain
 *   - ui-component → data-access UI directly querying the DB
 *   - utility → business-logic   "generic" code that knows the domain
 *   - utility → data-access      "generic" code that knows the DB
 *   - data-access → business-logic data layer reaching back upward
 *   - data-access → routing      data layer importing HTTP handlers
 *
 * Add to this list as new conventions become clear; remove entries when
 * a pattern turns out to be too noisy. Keep it conservative — every
 * entry creates issues, and false positives erode trust.
 */
const FORBIDDEN_PAIRS: readonly {
	source: NodeClassification
	target: NodeClassification
	reason: string
}[] = [
	{
		source: "routing",
		target: "data-access",
		reason: "Route handlers should call the domain, not query the database directly."
	},
	{
		source: "ui-component",
		target: "data-access",
		reason: "UI components should consume data via a hook or query layer, not query directly."
	},
	{
		source: "utility",
		target: "business-logic",
		reason:
			"Utility code should be domain-agnostic; importing business logic ties it to this project."
	},
	{
		source: "utility",
		target: "data-access",
		reason: "Utility code should be domain-agnostic; importing data-access ties it to this schema."
	},
	{
		source: "data-access",
		target: "business-logic",
		reason:
			"The data layer should be at the bottom of the stack; importing business logic creates upward coupling."
	},
	{
		source: "data-access",
		target: "routing",
		reason: "The data layer should not know about HTTP routes."
	}
]

interface Violation {
	target: GraphNode
	pair: (typeof FORBIDDEN_PAIRS)[number]
}

export function boundaryViolations(graph: Graph): Omit<Issue, "firstDetected">[] {
	const byId = new Map(graph.nodes.map((node) => [node.id, node]))
	const violationsBySource = new Map<string, Violation[]>()

	for (const edge of graph.edges) {
		if (edge.kind !== "dependency") continue
		const source = byId.get(edge.source)
		const target = byId.get(edge.target)
		if (!source || !target) continue
		// File-level only — module edges are rollups that'd re-flag the same problem.
		if (source.kind !== "file" || target.kind !== "file") continue
		if (!source.classification || !target.classification) continue
		const pair = FORBIDDEN_PAIRS.find(
			(candidate) =>
				candidate.source === source.classification && candidate.target === target.classification
		)
		if (!pair) continue
		const bucket = violationsBySource.get(source.path) ?? []
		bucket.push({ target, pair })
		violationsBySource.set(source.path, bucket)
	}

	const issues: Omit<Issue, "firstDetected">[] = []
	for (const [sourcePath, violations] of violationsBySource) {
		const affected = [sourcePath, ...new Set(violations.map((v) => v.target.path))]
		issues.push({
			id: `boundary:${sourcePath}`,
			category: "boundary-violation",
			severity: "warning",
			title: `${sourcePath} — ${violations.length} forbidden import${violations.length === 1 ? "" : "s"}`,
			description: formatViolations(violations),
			affected
		})
	}
	return issues
}

function formatViolations(violations: readonly Violation[]): string {
	const lines = violations.map(
		(v) => `[${v.pair.source} → ${v.pair.target}] ${v.target.path} — ${v.pair.reason}`
	)
	return lines.join("\n")
}
