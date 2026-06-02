import type Anthropic from "@anthropic-ai/sdk"
import type { Graph } from "@shared/schemas/graph"
import type { ChatEvent } from "@shared/schemas/chat"
import { mapAnthropicError } from "@server/llm/adapters/anthropic"
import type { AnthropicAgentRuntime } from "@server/llm/fallback/factory"
import { getNodeTool } from "@server/tools/get-node"
import { listNodesTool } from "@server/tools/list-nodes"
import { findSimilarToNodeTool } from "@server/tools/find-similar"
import { findSimilarToTextTool } from "@server/tools/find-similar-to-text"
import type { ToolContext, ToolDefinition } from "@server/tools/types"
import { QA_AGENT_SYSTEM_PROMPT, buildQaUserPrompt } from "@server/agent/prompt"
import { summarizeToolArgs, summarizeToolResult } from "@server/agent/summaries"

/**
 * QA Agent server loop — the hand-wired, STREAMING tool-use loop ARG-37 asks for.
 *
 * Unlike the god-file `AnthropicAgentAdapter` (batch-shaped: returns one verdict,
 * forces a terminal tool), this loop is open-ended chat: each turn it streams the
 * model's text to the client, and if the turn requests tools it runs them via the
 * shared `server/tools/` read tools, feeds the results back, and continues —
 * terminating when a turn requests no tools (the model has settled into a prose
 * answer). It reuses the low-level pieces the batch adapter also reuses
 * (`mapAnthropicError`, the `server/tools/` defs) rather than that adapter's
 * `runAgentLoop` contract, which is the wrong shape for streaming chat.
 *
 * Retry: deliberately NOT wrapped in `executeWithRetry`. Once we've streamed text
 * deltas for a turn, retrying the model call would replay partial output to the
 * client. Transient errors instead surface as a thrown `LlmError` (mapped here),
 * which the SSE route frames as a stream-closing `message-end`; the user resends.
 */

/** Read-only traversal tools the QA agent may call. Shared with the MCP server + god-file loop. */
const QA_AGENT_TOOLS: readonly ToolDefinition[] = [
	getNodeTool,
	listNodesTool,
	findSimilarToNodeTool,
	findSimilarToTextTool
]

/**
 * Safety cap on agent turns. The final allowed turn runs WITHOUT tools so the
 * model must answer in prose (a tool call there would have no follow-up turn to
 * consume its result) — so a normal turn-count exit always ends on a real answer,
 * not a dangling tool request.
 */
const MAX_QA_AGENT_STEPS = 8

export interface QaAgentParams {
	/** Shared across the whole assistant turn so all text + tool events land in one bubble. */
	messageId: string
	/** Configured Anthropic client + resolved model + per-call config, from the registry. */
	runtime: AnthropicAgentRuntime
	projectId: string
	projectName: string
	/** Already-loaded actual graph — handed to the tool context so reads don't re-fetch the blob. */
	graph: Graph
	userMessage: string
}

/**
 * Drive one user turn, yielding `ChatEvent`s as they happen. The caller (the SSE
 * route) writes each event to the wire. The generator owns the message lifecycle:
 * exactly one `message-start` at the top and one `message-end` when the model
 * stops requesting tools.
 */
export async function* runQaAgent(params: QaAgentParams): AsyncGenerator<ChatEvent> {
	const { messageId, runtime, projectId, projectName, graph, userMessage } = params
	const ctx: ToolContext = { projectId, graph }
	const toolsByName = new Map(QA_AGENT_TOOLS.map((tool) => [tool.name, tool]))
	const anthropicTools = QA_AGENT_TOOLS.map((tool) => toAnthropicTool(tool, projectName))
	const messages: Anthropic.MessageParam[] = [
		{ role: "user", content: buildQaUserPrompt({ projectName, graph, userMessage }) }
	]

	yield { type: "message-start", messageId, role: "assistant" }

	for (let step = 0; step < MAX_QA_AGENT_STEPS; step++) {
		const isLastStep = step === MAX_QA_AGENT_STEPS - 1
		const stream = runtime.client.messages.stream({
			model: runtime.model,
			max_tokens: runtime.taskConfig.maxOutputTokens,
			temperature: runtime.taskConfig.temperature,
			system: QA_AGENT_SYSTEM_PROMPT,
			messages,
			// Drop tools on the final allowed turn so the model answers in prose
			// instead of requesting a tool whose result we'd have no turn to feed back.
			// undefined omits the field — same as not sending tools at all.
			tools: isLastStep ? undefined : anthropicTools
		})

		let finalMessage: Anthropic.Message
		try {
			for await (const event of stream) {
				if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
					yield { type: "text-delta", messageId, delta: event.delta.text }
				}
			}
			finalMessage = await stream.finalMessage()
		} catch (error) {
			// Map to our provider-neutral error; the route turns the throw into a
			// stream-closing message-end. Reuses the 1-shot adapter's mapping so
			// error classification stays consistent across the LLM layer.
			throw mapAnthropicError(error)
		}

		const toolUses = finalMessage.content.filter(
			(block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
		)
		// Echo the assistant turn before answering its tool calls — the API requires
		// every tool_use to be followed by a matching tool_result.
		messages.push({ role: "assistant", content: finalMessage.content })

		if (toolUses.length === 0) {
			yield { type: "message-end", messageId }
			return
		}

		// Surface every tool call, run them concurrently (independent reads), then
		// surface each result in order. Mirrors the god-file loop's concurrent dispatch.
		for (const call of toolUses) {
			yield {
				type: "tool-call-start",
				messageId,
				toolCall: {
					id: call.id,
					name: call.name,
					argsSummary: summarizeToolArgs(call.name, call.input)
				}
			}
		}
		const outcomes = await Promise.all(
			toolUses.map((call) => runToolCall(messageId, call, toolsByName, ctx))
		)
		for (const outcome of outcomes) yield outcome.event
		messages.push({ role: "user", content: outcomes.map((outcome) => outcome.result) })
	}
}

interface ToolOutcome {
	/** The `tool-call-end` event surfaced to the client. */
	event: ChatEvent
	/** The `tool_result` block fed back to the model. */
	result: Anthropic.ToolResultBlockParam
}

/**
 * Run one tool call. A tool error (including an unknown tool name) is reported
 * in-band as a `tool-call-end` with status `error` and fed back to the model as
 * an `is_error` tool_result so it can recover — it never aborts the stream.
 */
async function runToolCall(
	messageId: string,
	call: Anthropic.ToolUseBlock,
	toolsByName: Map<string, ToolDefinition>,
	ctx: ToolContext
): Promise<ToolOutcome> {
	const tool = toolsByName.get(call.name)
	if (!tool) {
		const message = `Unknown tool "${call.name}"`
		return {
			event: {
				type: "tool-call-end",
				messageId,
				toolCallId: call.id,
				status: "error",
				error: message
			},
			result: { type: "tool_result", tool_use_id: call.id, is_error: true, content: message }
		}
	}
	try {
		const output = await tool.execute(ctx, call.input)
		return {
			event: {
				type: "tool-call-end",
				messageId,
				toolCallId: call.id,
				status: "done",
				resultSummary: summarizeToolResult(call.name, output)
			},
			result: { type: "tool_result", tool_use_id: call.id, content: JSON.stringify(output) }
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		return {
			event: {
				type: "tool-call-end",
				messageId,
				toolCallId: call.id,
				status: "error",
				error: message
			},
			result: { type: "tool_result", tool_use_id: call.id, is_error: true, content: message }
		}
	}
}

// Cast: `tool.toJsonSchema()` returns a JSON Schema object (via z.toJSONSchema),
// structurally compatible with Anthropic's `input_schema` dialect. The single
// commented SDK-boundary cast, same one the 1-shot + god-file adapters isolate.
function toAnthropicTool(tool: ToolDefinition, projectName: string): Anthropic.Tool {
	return {
		name: tool.name,
		description: tool.describe(projectName),
		input_schema: tool.toJsonSchema() as Anthropic.Tool.InputSchema
	}
}
