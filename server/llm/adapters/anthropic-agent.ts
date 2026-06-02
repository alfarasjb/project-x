import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import { observe } from "@langfuse/tracing"
import { LlmError, LlmErrorType } from "@server/llm/errors/types"
import { executeWithRetry } from "@server/llm/utils/retry"
import { extractUsage, mapAnthropicError } from "@server/llm/adapters/anthropic"
import type { AnthropicConfig } from "@server/llm/types/adapter-config"
import type { TaskConfig } from "@server/llm/fallback/chains"
import type { ObservabilityHook } from "@server/llm/types/observability"
import type {
	AgentAdapter,
	AgentLoopConfig,
	AgentToolExecutor,
	AgentToolSpec
} from "@server/llm/types/agent-adapter"
import type { GenerationResult } from "@server/llm/types/result"

const PROVIDER = "anthropic"

/**
 * Anthropic agent-loop adapter. Runs the Messages API in a tool-use loop:
 * each turn the model either calls traversal tools (we execute them and feed
 * `tool_result` blocks back) or calls the terminal tool to submit its verdict.
 * The final allowed turn forces the terminal tool, so the loop is bounded.
 *
 * Reuses the 1-shot adapter's `mapAnthropicError` + `extractUsage` and the
 * shared `executeWithRetry` so transient-error handling matches the rest of the
 * LLM layer.
 *
 * Observability: the whole loop is wrapped in ONE Langfuse generation span
 * (input = initial prompt, output = final verdict, usage = summed across turns).
 * We deliberately don't emit per-turn spans — the `ObservabilityHook` config
 * models a single prompt, not an evolving conversation, so aggregate token
 * attribution is the honest granularity. `observe()` is a passthrough when
 * Langfuse isn't configured (hook undefined).
 */
export class AnthropicAgentAdapter implements AgentAdapter {
	private readonly client: Anthropic
	private readonly defaultModel: string
	private readonly defaults: TaskConfig
	private readonly observability?: ObservabilityHook
	private readonly label: string

	constructor(config: AnthropicConfig, defaults: TaskConfig, label: string) {
		this.client = new Anthropic({ apiKey: config.apiKey })
		this.defaultModel = config.defaultModel
		this.defaults = defaults
		this.observability = config.observability
		this.label = label
	}

	async runAgentLoop<TSchema extends z.ZodTypeAny>(
		config: AgentLoopConfig<TSchema>
	): Promise<GenerationResult<z.infer<TSchema>>> {
		const traced = observe(
			async () => {
				this.observability?.onGenerationStart?.({
					provider: PROVIDER,
					model: this.defaultModel,
					config: {
						systemPrompt: config.systemPrompt,
						userPrompt: config.userPrompt,
						temperature: config.temperature ?? this.defaults.temperature,
						maxOutputTokens: config.maxOutputTokens ?? this.defaults.maxOutputTokens
					}
				})
				try {
					const result = await this.runLoop(config)
					this.observability?.onGenerationComplete?.(result)
					return result
				} catch (error) {
					this.observability?.onGenerationError?.(error)
					throw error
				}
			},
			{ name: `${this.label} (anthropic/${this.defaultModel})`, asType: "generation" }
		)
		return traced()
	}

	private async runLoop<TSchema extends z.ZodTypeAny>(
		config: AgentLoopConfig<TSchema>
	): Promise<GenerationResult<z.infer<TSchema>>> {
		const model = this.defaultModel
		const tools = this.buildTools(config)
		const messages: Anthropic.MessageParam[] = [{ role: "user", content: config.userPrompt }]
		let inputTokens = 0
		let outputTokens = 0

		for (let step = 0; step < config.maxSteps; step++) {
			const forceTerminal = step === config.maxSteps - 1
			const response = await executeWithRetry(
				async () => {
					try {
						return await this.client.messages.create({
							model,
							max_tokens: config.maxOutputTokens ?? this.defaults.maxOutputTokens,
							temperature: config.temperature ?? this.defaults.temperature,
							...(config.systemPrompt ? { system: config.systemPrompt } : {}),
							messages,
							tools,
							tool_choice: forceTerminal
								? { type: "tool", name: config.terminal.name }
								: { type: "auto" }
						})
					} catch (error) {
						throw mapAnthropicError(error)
					}
				},
				{ provider: PROVIDER, operationName: "runAgentLoop" }
			)

			const usage = extractUsage(response.usage)
			inputTokens += usage.inputTokens
			outputTokens += usage.outputTokens

			const toolUses = response.content.filter(
				(block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
			)

			const terminalCall = toolUses.find((call) => call.name === config.terminal.name)
			if (terminalCall) {
				const parsed = config.terminal.schema.safeParse(terminalCall.input)
				if (!parsed.success) {
					throw new LlmError(
						LlmErrorType.PARSING,
						PROVIDER,
						`Agent terminal tool "${config.terminal.name}" failed schema validation: ${parsed.error.message}`,
						parsed.error
					)
				}
				return {
					content: parsed.data,
					usage: { inputTokens, outputTokens },
					provider: PROVIDER,
					model
				}
			}

			// Echo the assistant turn before answering its tool calls (the API
			// requires every tool_use to be followed by a matching tool_result).
			messages.push({ role: "assistant", content: response.content })

			if (toolUses.length === 0) {
				// Model neither called a tool nor submitted — nudge it forward.
				messages.push({
					role: "user",
					content: `Call one of the traversal tools to gather more context, or call "${config.terminal.name}" to submit your verdict.`
				})
				continue
			}

			messages.push({ role: "user", content: await runToolCalls(toolUses, config.executeTool) })
		}

		// Unreachable in practice — the final step forces the terminal tool, which
		// returns above. Guard so a contract change fails loud, not silent.
		throw new LlmError(
			LlmErrorType.PARSING,
			PROVIDER,
			`Agent loop hit maxSteps (${config.maxSteps}) without a terminal verdict`
		)
	}

	private buildTools<TSchema extends z.ZodTypeAny>(
		config: AgentLoopConfig<TSchema>
	): Anthropic.Tool[] {
		return [
			...config.tools.map(toAnthropicTool),
			toAnthropicTool({
				name: config.terminal.name,
				description: config.terminal.description,
				inputSchema: z.toJSONSchema(config.terminal.schema, { target: "draft-07" })
			})
		]
	}
}

/** Run a turn's tool calls concurrently — they're independent reads. Order is preserved. */
async function runToolCalls(
	toolUses: readonly Anthropic.ToolUseBlock[],
	executeTool: AgentToolExecutor
): Promise<Anthropic.ToolResultBlockParam[]> {
	return Promise.all(
		toolUses.map(async (call): Promise<Anthropic.ToolResultBlockParam> => {
			try {
				const result = await executeTool({ name: call.name, input: call.input })
				return { type: "tool_result", tool_use_id: call.id, content: JSON.stringify(result) }
			} catch (error) {
				return {
					type: "tool_result",
					tool_use_id: call.id,
					is_error: true,
					content: error instanceof Error ? error.message : String(error)
				}
			}
		})
	)
}

// Cast: z.toJSONSchema / the upstream tool defs return a JSON Schema object,
// structurally compatible with Anthropic's `input_schema` dialect. Same single
// commented cast the 1-shot AnthropicAdapter uses for its forced tool.
function toAnthropicTool(spec: AgentToolSpec): Anthropic.Tool {
	return {
		name: spec.name,
		description: spec.description,
		input_schema: spec.inputSchema as Anthropic.Tool.InputSchema
	}
}
