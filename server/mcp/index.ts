import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import {
	EMPTY_GRAPH,
	NodeClassificationSchema,
	type Description,
	type GraphNode
} from "@shared/schemas/graph"
import { IssueSeveritySchema, type Issue } from "@shared/schemas/issue"
import {
	getNodeDetail,
	getProjectGraph,
	getProjectIssues,
	setNodeClassification,
	setNodeDescription
} from "@server/domain/graph"
import { findSimilarNodes, findSimilarToText } from "@server/domain/embeddings/similarity"
import { resolveBoundProject } from "@server/mcp/project"

/**
 * Project X MCP server (stdio).
 *
 * Exposes one project's architecture graph to an MCP agent — so the agent
 * (Claude Code) can read the graph to reason about the codebase, trace flows,
 * and write descriptions back into it. The server binds to a single project
 * for the whole session (`resolveBoundProject`), so no tool takes a project
 * argument.
 *
 * stdio rule: never write to stdout — it's the protocol channel. Diagnostics go
 * to stderr via `console.error`.
 */

/** Project-scoped tool error → an MCP error result the agent can read. */
function toolError(error: unknown): { isError: true; content: { type: "text"; text: string }[] } {
	return {
		isError: true,
		content: [
			{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }
		]
	}
}

/** A node trimmed to the fields worth showing in a list or an edge reference. */
function briefNode(node: GraphNode): { id: string; kind: string; label: string } {
	return { id: node.id, kind: node.kind, label: node.label }
}

/** Sort comparator: critical → warning → info. Mirrors the dashboard Issue Feed. */
const SEVERITY_RANK = { critical: 0, warning: 1, info: 2 } as const
function bySeverity(a: Issue, b: Issue): number {
	return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
}

async function main(): Promise<void> {
	const project = await resolveBoundProject()

	const server = new McpServer(
		{ name: "project-x-mcp-server", version: "0.0.0" },
		{ capabilities: { resources: {}, tools: {} } }
	)

	// --- Resource: the whole architecture graph ------------------------------
	// For a repo small enough to fit in context this is the main exploration
	// surface — the agent reads it and traverses nodes + edges directly.
	server.registerResource(
		"graph",
		"projectx://graph",
		{
			title: "Architecture graph",
			description: `Parsed architecture graph for "${project.name}" — nodes (modules, files, primitives) and dependency edges, as JSON.`,
			mimeType: "application/json"
		},
		async (uri) => {
			const graph = await getProjectGraph(project.id)
			return {
				contents: [
					{
						uri: uri.href,
						mimeType: "application/json",
						text: JSON.stringify(graph?.actual ?? EMPTY_GRAPH, null, 2)
					}
				]
			}
		}
	)

	// --- Tool: list nodes ----------------------------------------------------
	server.registerTool(
		"projectx_list_nodes",
		{
			title: "List graph nodes",
			description: `List nodes in the architecture graph for "${project.name}" — modules (folders) and files — each with its current description and classification.

Use this to take inventory of the codebase, to find which nodes still need a description (filter described=false), or which still need a classification (filter classified=false). To inspect one node's connections, use projectx_get_node. To read the entire graph at once, use the projectx://graph resource.

Args:
  - kind (string, optional): restrict to one kind, e.g. "module" or "file". Omit for both modules and files (symbol-level nodes are excluded).
  - described (boolean, optional): true → only nodes with a description; false → only nodes without one; omit → all.
  - classified (boolean, optional): true → only nodes with a classification; false → only nodes without one; omit → all.
  - limit (number): max nodes to return, 1-500 (default 200).
  - offset (number): nodes to skip, for pagination (default 0).

Returns JSON: { total, count, offset, has_more, nodes: [{ id, path, kind, label, described, description, classified, classification }] }. A node's "id" is its path — pass it as node_id to projectx_get_node, projectx_set_description, or projectx_classify_node.`,
			inputSchema: {
				kind: z
					.string()
					.min(1)
					.optional()
					.describe('Restrict to one kind, e.g. "module" or "file". Omit for modules + files.'),
				described: z
					.boolean()
					.optional()
					.describe("Filter by whether the node has a description. Omit for all nodes."),
				classified: z
					.boolean()
					.optional()
					.describe("Filter by whether the node has a classification. Omit for all nodes."),
				limit: z.number().int().min(1).max(500).default(200).describe("Max nodes to return."),
				offset: z.number().int().min(0).default(0).describe("Nodes to skip, for pagination.")
			},
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false
			}
		},
		async ({ kind, described, classified, limit, offset }) => {
			try {
				const graph = await getProjectGraph(project.id)
				const all = graph?.actual.nodes ?? []
				const byKind = kind
					? all.filter((node) => node.kind === kind)
					: all.filter((node) => node.kind === "module" || node.kind === "file")
				const byDescribed =
					described === undefined
						? byKind
						: byKind.filter((node) => (node.description !== undefined) === described)
				const filtered =
					classified === undefined
						? byDescribed
						: byDescribed.filter((node) => (node.classification !== undefined) === classified)
				const page = filtered.slice(offset, offset + limit)
				const result = {
					total: filtered.length,
					count: page.length,
					offset,
					has_more: offset + page.length < filtered.length,
					nodes: page.map((node) => ({
						id: node.id,
						path: node.path,
						kind: node.kind,
						label: node.label,
						described: node.description !== undefined,
						description: node.description ?? null,
						classified: node.classification !== undefined,
						classification: node.classification ?? null
					}))
				}
				return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }
			} catch (error) {
				return toolError(error)
			}
		}
	)

	// --- Tool: get node ------------------------------------------------------
	server.registerTool(
		"projectx_get_node",
		{
			title: "Get node detail",
			description: `Get full detail for one node in the architecture graph for "${project.name}": its kind, path, layer, signature, description, containment children, and the edges in and out of it.

Use this to inspect a specific node and to TRACE A FLOW — get a node, follow one of its "dependencies" to the next node, call projectx_get_node again, and repeat. Use projectx_list_nodes to discover node ids; read the projectx://graph resource when you want the whole graph at once.

Args:
  - node_id (string): the node's id, which is its path (e.g. "server/domain/graph/index.ts" for a file, or "server/domain/graph" for a module).

Returns JSON: {
  id, path, kind, label, layer, classification, signature, description,
  parent: { id, label } | null,
  children: [{ id, kind, label }],       // nodes contained inside this one
  dependencies: [{ id, kind, label }],   // nodes this node imports / depends on
  dependents: [{ id, kind, label }]      // nodes that import / depend on this one
}. Errors if the node is unknown.`,
			inputSchema: {
				node_id: z
					.string()
					.min(1)
					.describe('The node id (its path), e.g. "server/domain/graph/index.ts".')
			},
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false
			}
		},
		async ({ node_id }) => {
			try {
				const detail = await getNodeDetail(project.id, node_id)
				const result = {
					id: detail.node.id,
					path: detail.node.path,
					kind: detail.node.kind,
					label: detail.node.label,
					layer: detail.node.layer ?? null,
					classification: detail.node.classification ?? null,
					signature: detail.node.signature ?? null,
					description: detail.node.description ?? null,
					parent: detail.parent ? { id: detail.parent.id, label: detail.parent.label } : null,
					children: detail.children.map(briefNode),
					dependencies: detail.dependencies.map(briefNode),
					dependents: detail.dependents.map(briefNode)
				}
				return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }
			} catch (error) {
				return toolError(error)
			}
		}
	)

	// --- Tool: set description -----------------------------------------------
	server.registerTool(
		"projectx_set_description",
		{
			title: "Set node description",
			description: `Write a description onto a node in the architecture graph for "${project.name}" (recorded with source "ai").

Intended for describing files and modules: read the code, then summarise it here. The "what" field is the searchable summary — keep it concise and specific.

Args:
  - node_id (string): the node's id, which is its path (e.g. "src/lib/utils.ts" for a file, "src/lib" for a module). Get ids from projectx_list_nodes.
  - what (string): a concise summary of what the file or module does. Required.
  - why (string, optional): rationale — why it exists or its design intent.
  - overwrite (boolean): replace an existing human-authored ("manual") description (default false).

Returns JSON: { ok: true, node: { id, path, description } }. Errors if the node is unknown, or if it has a manual description and overwrite is false.`,
			inputSchema: {
				node_id: z
					.string()
					.min(1)
					.describe('The node id (its path), e.g. "src/lib/utils.ts" or "src/lib".'),
				what: z
					.string()
					.min(1)
					.max(2000)
					.describe(
						"Concise summary of what the file or module does — the searchable description."
					),
				why: z
					.string()
					.min(1)
					.max(2000)
					.optional()
					.describe("Optional rationale — why it exists or its design intent."),
				overwrite: z
					.boolean()
					.default(false)
					.describe('Replace an existing human-authored ("manual") description.')
			},
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false
			}
		},
		async ({ node_id, what, why, overwrite }) => {
			try {
				const description: Description = { what, source: "ai", ...(why ? { why } : {}) }
				const node = await setNodeDescription(project.id, node_id, description, { overwrite })
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{ ok: true, node: { id: node.id, path: node.path, description: node.description } },
								null,
								2
							)
						}
					]
				}
			} catch (error) {
				return toolError(error)
			}
		}
	)

	// --- Tool: classify node -------------------------------------------------
	server.registerTool(
		"projectx_classify_node",
		{
			title: "Classify a node",
			description: `Set the audit classification on a file or module in the architecture graph for "${project.name}".

The classification is the *role* the code plays — what it IS, not where it lives. Pick from:
  - "business-logic"   — domain operations: auth flows, payment processing, the rules that make the product the product
  - "routing"          — HTTP routes / request handlers / page routes; thin glue to the domain
  - "data-access"      — DB queries, persistence, ORM models, schema, migrations
  - "ui-component"     — React/Vue/Svelte components, UI primitives
  - "utility"          — generic helpers with no domain knowledge (formatters, cn, lodash-likes)
  - "config"           — env loading, build/lint/runtime config, app wiring
  - "type-definition"  — pure type/interface declarations, schema-as-types
  - "unknown"          — genuinely can't tell after reading the code; safer than guessing

Read the file before classifying — the imports and the actual code matter, not just the path. A "utils.ts" full of DB queries is data-access; a "routes" file that's mostly business rules is business-logic. The whole point is that this catches misplacements.

Symbols inherit from their parent file, so you only need to classify files and modules.

Args:
  - node_id (string): the node's id (its path), e.g. "server/domain/project.ts" or "server/domain".
  - classification (string): one of the enum values above.

Returns JSON: { ok: true, node: { id, path, classification } }. Errors if the node is unknown or the classification value is invalid.`,
			inputSchema: {
				node_id: z
					.string()
					.min(1)
					.describe('The node id (its path), e.g. "server/domain/project.ts".'),
				classification: NodeClassificationSchema.describe(
					'One of: "business-logic" | "routing" | "data-access" | "ui-component" | "utility" | "config" | "type-definition" | "unknown".'
				)
			},
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false
			}
		},
		async ({ node_id, classification }) => {
			try {
				const node = await setNodeClassification(project.id, node_id, classification)
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									ok: true,
									node: {
										id: node.id,
										path: node.path,
										classification: node.classification
									}
								},
								null,
								2
							)
						}
					]
				}
			} catch (error) {
				return toolError(error)
			}
		}
	)

	// --- Tool: list issues --------------------------------------------------
	server.registerTool(
		"projectx_list_issues",
		{
			title: "List audit issues",
			description: `List architecture audit issues for "${project.name}" — findings from the heuristic rules (circular deps, god files, bidirectional deps) and from AI Review (per-file concerns Claude flagged during analyze).

Use this to take inventory of what's broken, or to scope a refactor pass. To attack the highest-priority items, filter with severity=["critical"] (or include "warning" too). To focus on AI-flagged content problems, filter with category="ai-review". To inspect one issue's full detail (including structured concerns for ai-review), call projectx_get_issue with its id.

Args:
  - severity (array of strings, optional): restrict to one or more severities — "critical" | "warning" | "info". Omit for all.
  - category (string, optional): restrict to one category, e.g. "ai-review" | "god-file" | "circular-dep" | "bidirectional-deps". Omit for all.
  - limit (number): max issues to return, 1-200 (default 100).
  - offset (number): issues to skip, for pagination (default 0).

Returns JSON: { total, count, offset, has_more, issues: [{ id, severity, category, title, affected, firstDetected, concernCount }] }. The "id" can be passed to projectx_get_issue. "concernCount" is the number of structured concerns on the issue — only populated for ai-review issues, useful for ranking.`,
			inputSchema: {
				severity: z
					.array(IssueSeveritySchema)
					.optional()
					.describe('Severities to include, e.g. ["critical", "warning"]. Omit for all.'),
				category: z
					.string()
					.min(1)
					.optional()
					.describe('Restrict to one category, e.g. "ai-review" or "god-file". Omit for all.'),
				limit: z.number().int().min(1).max(200).default(100).describe("Max issues to return."),
				offset: z.number().int().min(0).default(0).describe("Issues to skip, for pagination.")
			},
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false
			}
		},
		async ({ severity, category, limit, offset }) => {
			try {
				const all = await getProjectIssues(project.id)
				const filtered = all
					.filter((issue) => (severity ? severity.includes(issue.severity) : true))
					.filter((issue) => (category ? issue.category === category : true))
					.sort(bySeverity)
				const page = filtered.slice(offset, offset + limit)
				const result = {
					total: filtered.length,
					count: page.length,
					offset,
					has_more: offset + page.length < filtered.length,
					issues: page.map((issue) => ({
						id: issue.id,
						severity: issue.severity,
						category: issue.category,
						title: issue.title,
						affected: issue.affected,
						firstDetected: issue.firstDetected,
						concernCount: issue.concerns?.length ?? 0
					}))
				}
				return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }
			} catch (error) {
				return toolError(error)
			}
		}
	)

	// --- Tool: get issue ----------------------------------------------------
	server.registerTool(
		"projectx_get_issue",
		{
			title: "Get issue detail",
			description: `Get full detail for one audit issue in "${project.name}": the title, description, all affected node paths, and (for ai-review issues) the structured per-concern list with category + message.

Use this after projectx_list_issues to pull the body of an issue you intend to fix. The "affected" paths are the files to read and modify. For an ai-review issue, the "concerns" array tells you exactly WHAT the AI flagged, by category — work through them as a checklist.

Args:
  - issue_id (string): the issue id, e.g. "ai-review:src/routes/onboarding.tsx" or "god-file:server/db/seed.ts".

Returns JSON: {
  id, category, severity, title, description, affected,
  firstDetected,
  concerns: [{ category, message }] | null   // populated for ai-review issues
}. Errors if no issue matches the id.`,
			inputSchema: {
				issue_id: z
					.string()
					.min(1)
					.describe('The issue id, e.g. "ai-review:src/routes/onboarding.tsx".')
			},
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false
			}
		},
		async ({ issue_id }) => {
			try {
				const all = await getProjectIssues(project.id)
				const issue = all.find((candidate) => candidate.id === issue_id)
				if (!issue) {
					return toolError(new Error(`No issue with id "${issue_id}".`))
				}
				const result = {
					id: issue.id,
					category: issue.category,
					severity: issue.severity,
					title: issue.title,
					description: issue.description,
					affected: issue.affected,
					firstDetected: issue.firstDetected,
					concerns: issue.concerns ?? null
				}
				return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }
			} catch (error) {
				return toolError(error)
			}
		}
	)

	// --- Tool: semantic search by text query -------------------------------
	server.registerTool(
		"projectx_search_similar_nodes",
		{
			title: "Search nodes by semantic similarity to a text query",
			description: `Find the top-K nodes in "${project.name}" whose descriptions are most semantically similar to a free-form text query. Backed by vector embeddings of each node's path + classification + summary + rationale (Voyage code-3, 1024 dims, cosine distance).

Use this to FIND CODE BY INTENT — "where does auth happen?", "which file handles localStorage?", "is there already a date formatter?". This is the right first move when you're looking for a place to put new code or a primitive that might already exist. Pair with projectx_get_node on the top result to inspect details.

Args:
  - query (string): the text to search for. Plain English is fine ("save todos to disk"); structural terms work too ("routing layer").
  - k (number, optional): how many results to return. Default 5, max 25.
  - kinds (array of "file" | "module", optional): restrict to certain node kinds. Default ["file", "module"] (both).

Returns JSON: { query, count, results: [{ nodeId, kind, distance, classification, summary }] }. Lower distance = better match (0 = identical, ~0.3 = strong, ~0.5 = topical, >0.7 = weak). Empty results = no nodes have been embedded yet (the project must be Analyzed first, which triggers embedding) OR the VOYAGE_API_KEY is unset on the server.`,
			inputSchema: {
				query: z.string().min(1).describe("Free-form text to search for."),
				k: z
					.number()
					.int()
					.min(1)
					.max(25)
					.optional()
					.describe("Top K results to return. Default 5."),
				kinds: z
					.array(z.enum(["file", "module"]))
					.optional()
					.describe('Restrict to certain node kinds. Default ["file", "module"].')
			},
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false
			}
		},
		async ({ query, k, kinds }) => {
			try {
				const graph = (await getProjectGraph(project.id))?.actual ?? EMPTY_GRAPH
				const nodesById = new Map<string, GraphNode>(graph.nodes.map((n) => [n.id, n]))
				const results = await findSimilarToText({
					projectId: project.id,
					text: query,
					k: k ?? 5,
					...(kinds ? { kinds } : {})
				})
				const enriched = results.map((r) => {
					const node = nodesById.get(r.nodeId)
					return {
						nodeId: r.nodeId,
						kind: r.kind,
						distance: Number(r.distance.toFixed(4)),
						classification: node?.classification ?? null,
						summary: node?.description?.what ?? null
					}
				})
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify({ query, count: enriched.length, results: enriched }, null, 2)
						}
					]
				}
			} catch (error) {
				return toolError(error)
			}
		}
	)

	// --- Tool: peer similarity by source node ------------------------------
	server.registerTool(
		"projectx_find_similar_to_node",
		{
			title: "Find nodes similar to one specific node",
			description: `Find the top-K nodes most similar to a given source node in "${project.name}", excluding the source itself. Same vector backend as projectx_search_similar_nodes.

Use this when you've ALREADY found one relevant node (via projectx_list_nodes, projectx_get_node, or projectx_search_similar_nodes) and want to discover its NEIGHBOURS — files that do similar work, that probably want to be touched together, or that may be duplicates you can consolidate. Defaults to peer-level matches (a file matches files, a module matches modules); pass kinds to widen.

Args:
  - node_id (string): id of the source node (its path), e.g. "src/lib/storage.ts".
  - k (number, optional): how many results to return. Default 5, max 25.
  - kinds (array of "file" | "module", optional): restrict to certain node kinds. Defaults to the source node's own kind.

Returns JSON: { source: { nodeId, kind, summary }, count, results: [{ nodeId, kind, distance, classification, summary }] }. Empty results = the source node has no embedding yet (it must be Analyzed first) OR no other nodes are embedded.`,
			inputSchema: {
				node_id: z.string().min(1).describe("Id of the source node (its path)."),
				k: z
					.number()
					.int()
					.min(1)
					.max(25)
					.optional()
					.describe("Top K results to return. Default 5."),
				kinds: z
					.array(z.enum(["file", "module"]))
					.optional()
					.describe("Restrict to certain node kinds. Defaults to the source node's kind.")
			},
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false
			}
		},
		async ({ node_id, k, kinds }) => {
			try {
				const graph = (await getProjectGraph(project.id))?.actual ?? EMPTY_GRAPH
				const nodesById = new Map<string, GraphNode>(graph.nodes.map((n) => [n.id, n]))
				const source = nodesById.get(node_id)
				const results = await findSimilarNodes({
					projectId: project.id,
					nodeId: node_id,
					k: k ?? 5,
					...(kinds ? { kinds } : {})
				})
				const enriched = results.map((r) => {
					const node = nodesById.get(r.nodeId)
					return {
						nodeId: r.nodeId,
						kind: r.kind,
						distance: Number(r.distance.toFixed(4)),
						classification: node?.classification ?? null,
						summary: node?.description?.what ?? null
					}
				})
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(
								{
									source: source
										? {
												nodeId: source.id,
												kind: source.kind,
												summary: source.description?.what ?? null
											}
										: { nodeId: node_id, kind: null, summary: null },
									count: enriched.length,
									results: enriched
								},
								null,
								2
							)
						}
					]
				}
			} catch (error) {
				return toolError(error)
			}
		}
	)

	const transport = new StdioServerTransport()
	await server.connect(transport)
	console.error(
		`project-x MCP server: serving "${project.name}" (${project.slug}) — project ${project.id}`
	)
}

main().catch((error) => {
	console.error(
		`project-x MCP server failed to start: ${error instanceof Error ? error.message : String(error)}`
	)
	process.exit(1)
})
