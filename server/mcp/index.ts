import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { EMPTY_GRAPH, type Description } from "@shared/schemas/graph"
import { getProjectGraph, setNodeDescription } from "@server/domain/graph"
import { resolveBoundProject } from "@server/mcp/project"

/**
 * Project X MCP server (stdio).
 *
 * Exposes one project's architecture graph to an MCP agent — so the agent
 * (Claude Code) can read the graph to reason about the codebase, and write
 * file descriptions back into it. The server binds to a single project for the
 * whole session (`resolveBoundProject`), so no tool takes a project argument.
 *
 * stdio rule: never write to stdout — it's the protocol channel. Diagnostics go
 * to stderr via `console.error`.
 */

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

	// --- Tool: list files ----------------------------------------------------
	server.registerTool(
		"projectx_list_files",
		{
			title: "List files",
			description: `List the file nodes in the architecture graph for "${project.name}", each with its current description.

Use this to see which files still need a description (filter described=false), and to fetch descriptions that already exist.

Args:
  - described (boolean, optional): true → only files with a description; false → only files without one; omit → all files.
  - limit (number): max files to return, 1-500 (default 200).
  - offset (number): files to skip, for pagination (default 0).

Returns JSON: { total, count, offset, has_more, files: [{ id, path, label, described, description }] }. A file's "id" is its path — pass it as node_id to projectx_set_description.`,
			inputSchema: {
				described: z
					.boolean()
					.optional()
					.describe("Filter by whether the file has a description. Omit for all files."),
				limit: z.number().int().min(1).max(500).default(200).describe("Max files to return."),
				offset: z.number().int().min(0).default(0).describe("Files to skip, for pagination.")
			},
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false
			}
		},
		async ({ described, limit, offset }) => {
			try {
				const graph = await getProjectGraph(project.id)
				const files = (graph?.actual.nodes ?? []).filter((node) => node.kind === "file")
				const filtered =
					described === undefined
						? files
						: files.filter((node) => (node.description !== undefined) === described)
				const page = filtered.slice(offset, offset + limit)
				const result = {
					total: filtered.length,
					count: page.length,
					offset,
					has_more: offset + page.length < filtered.length,
					files: page.map((node) => ({
						id: node.id,
						path: node.path,
						label: node.label,
						described: node.description !== undefined,
						description: node.description ?? null
					}))
				}
				return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }
			} catch (error) {
				return {
					isError: true,
					content: [
						{
							type: "text",
							text: `Error: ${error instanceof Error ? error.message : String(error)}`
						}
					]
				}
			}
		}
	)

	// --- Tool: set description -----------------------------------------------
	server.registerTool(
		"projectx_set_description",
		{
			title: "Set node description",
			description: `Write a description onto a node in the architecture graph for "${project.name}" (recorded with source "ai").

Intended for describing files: read the file, then summarise it here. The "what" field is the searchable summary — keep it concise and specific.

Args:
  - node_id (string): the node's id, which is its path (e.g. "src/lib/utils.ts"). Get ids from projectx_list_files.
  - what (string): a concise summary of what the file does. Required.
  - why (string, optional): rationale — why the file exists or its design intent.
  - overwrite (boolean): replace an existing human-authored ("manual") description (default false).

Returns JSON: { ok: true, node: { id, path, description } }. Errors if the node is unknown, or if it has a manual description and overwrite is false.`,
			inputSchema: {
				node_id: z.string().min(1).describe('The node id (its path), e.g. "src/lib/utils.ts".'),
				what: z
					.string()
					.min(1)
					.max(2000)
					.describe("Concise summary of what the file does — the searchable description."),
				why: z
					.string()
					.min(1)
					.max(2000)
					.optional()
					.describe("Optional rationale — why the file exists or its design intent."),
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
				return {
					isError: true,
					content: [
						{
							type: "text",
							text: `Error: ${error instanceof Error ? error.message : String(error)}`
						}
					]
				}
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
