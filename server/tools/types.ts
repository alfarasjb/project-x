import { z } from "zod"
import type { Graph } from "@shared/schemas/graph"

/**
 * Shared tool core. A `ToolDefinition` is transport-neutral: its `execute`
 * validates raw input and returns a typed domain value — never an MCP `content`
 * envelope. Two callers wrap it:
 *   - the MCP server (`server/mcp/index.ts`) binds `projectId` from the bound
 *     project, runs `execute`, and JSON-stringifies the result into `content`.
 *   - the in-process god-file agent loop runs the SAME defs directly, feeding
 *     each result back as a `tool_result` — no MCP transport involved.
 *
 * This is the seam ARG-9 extracts so the agent loop can traverse the graph
 * without re-implementing (or reaching into) the MCP tool bodies.
 */

/**
 * Context every tool handler receives. `graph` is an optional already-loaded
 * actual graph: an in-process caller (the god-file agent loop) passes the graph
 * it already holds so the read tools don't re-fetch the JSONB blob on every call
 * inside a multi-step loop. The MCP path omits it and the tools fall back to a
 * DB read.
 */
export interface ToolContext {
	projectId: string
	graph?: Graph
}

/**
 * Erased, uniform shape both callers consume. `defineTool` produces it from a
 * fully-typed definition, so type safety lives at the definition site while the
 * consumers hold a single homogeneous type.
 */
export interface ToolDefinition {
	name: string
	/** Built per-project so the bound project's name can appear in the agent-facing guidance. */
	describe: (projectName: string) => string
	/** Zod object shape — passed to the MCP server's `registerTool` for input validation. */
	rawShape: z.ZodRawShape
	/**
	 * JSON Schema for the provider tool definition (the agent loop's tool
	 * input_schema). Opaque provider payload — the agent adapter casts it to the
	 * SDK's schema type at its boundary, so it's typed `unknown` here.
	 */
	toJsonSchema: () => unknown
	/** Validate raw input, run the handler, return the domain result (erased to `unknown`). */
	execute: (ctx: ToolContext, rawInput: unknown) => Promise<unknown>
}

/**
 * Define a tool with full input/output inference at the call site. The returned
 * `ToolDefinition` erases the generics so a heterogeneous tool list stays one type.
 */
export function defineTool<TShape extends z.ZodRawShape, TOutput>(def: {
	name: string
	describe: (projectName: string) => string
	inputSchema: z.ZodObject<TShape>
	handler: (args: { ctx: ToolContext; input: z.output<z.ZodObject<TShape>> }) => Promise<TOutput>
}): ToolDefinition {
	return {
		name: def.name,
		describe: def.describe,
		rawShape: def.inputSchema.shape,
		toJsonSchema: () => z.toJSONSchema(def.inputSchema, { target: "draft-07" }),
		execute: async (ctx, rawInput) => def.handler({ ctx, input: def.inputSchema.parse(rawInput) })
	}
}
