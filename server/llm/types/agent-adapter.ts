import type { z } from "zod"
import type { GenerationResult } from "@server/llm/types/result"

/**
 * Multi-step agent adapter — the loop counterpart to the strictly-1-shot
 * `LlmAdapter`. The adapter owns the provider message loop (call → tool_use →
 * tool_result → repeat) and terminates when the model calls the `terminal`
 * tool, validating that tool's input against `terminal.schema`.
 *
 * Deliberately graph-agnostic: the caller supplies the traversal `tools` and an
 * `executeTool` callback, so the adapter never imports the domain. That keeps
 * the god-file handler (ARG-9) and any future agent handler on one loop.
 */

/** A tool the model may call during the loop. `inputSchema` is JSON Schema (provider format). */
export interface AgentToolSpec {
	name: string
	description: string
	/** JSON Schema for the tool input — produced by `z.toJSONSchema` upstream; cast at the SDK boundary. */
	inputSchema: unknown
}

/**
 * Runs a tool call the model requested and returns its result. The adapter
 * serializes the result into the `tool_result` block, so any JSON-serializable
 * value is fine. Throwing surfaces an `is_error` tool_result to the model.
 */
export type AgentToolExecutor = (call: { name: string; input: unknown }) => Promise<unknown>

export interface AgentLoopConfig<TSchema extends z.ZodTypeAny> {
	systemPrompt?: string
	userPrompt: string
	/** Traversal tools the model may call to gather context. */
	tools: AgentToolSpec[]
	executeTool: AgentToolExecutor
	/**
	 * Terminal tool the model calls to finish. Its input is validated against
	 * `schema`; on the final allowed step the adapter forces this tool so the
	 * loop always yields a verdict (or throws) rather than running unbounded.
	 */
	terminal: { name: string; description: string; schema: TSchema }
	/** Hard cap on model turns. The last turn forces the terminal tool. */
	maxSteps: number
	temperature?: number
	maxOutputTokens?: number
}

export interface AgentAdapter {
	runAgentLoop<TSchema extends z.ZodTypeAny>(
		config: AgentLoopConfig<TSchema>
	): Promise<GenerationResult<z.infer<TSchema>>>
}
