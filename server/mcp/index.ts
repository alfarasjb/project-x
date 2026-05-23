import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import {
	EMPTY_GRAPH,
	NodeClassificationSchema,
	type Description,
	type GraphNode
} from "@shared/schemas/graph"
import {
	getNodeDetail,
	getProjectGraph,
	setNodeClassification,
	setNodeDescription
} from "@server/domain/graph"
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
