import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import { BaseLlmAdapter } from "@server/llm/adapters/base"
import { LlmError, LlmErrorType } from "@server/llm/errors/types"
import type { AnthropicConfig, LlmGenerationConfig } from "@server/llm/types/config"
import type { ObservabilityHook } from "@server/llm/types/observability"
import type { GenerationResult, TokenUsage } from "@server/llm/types/result"

const PROVIDER = "anthropic"

/**
 * Default token cap for free-form generation. Caller can override per call;
 * structured generation gets its own default via the per-operation config.
 */
const DEFAULT_MAX_TOKENS = 1024

/**
 * Anthropic adapter — Messages API only (the Completions API is deprecated).
 * Structured output goes through tool_use (`tool_choice: { type: "tool", ... }`)
 * so the model is forced into the schema; we never round-trip via free-form
 * JSON repair.
 *
 * Error mapping translates the SDK's typed error hierarchy into our
 * provider-neutral `LlmErrorType`. Authentication and bad-request errors are
 * not retryable; rate limit and 5xx-class errors are.
 */
export class AnthropicAdapter extends BaseLlmAdapter {
	readonly provider = PROVIDER
	private readonly client: Anthropic
	private readonly defaultModel: string
	private readonly observability?: ObservabilityHook

	constructor(config: AnthropicConfig) {
		super()
		this.client = new Anthropic({ apiKey: config.apiKey })
		this.defaultModel = config.defaultModel
		this.observability = config.observability
	}

	protected async callGenerate(config: LlmGenerationConfig): Promise<GenerationResult<string>> {
		const model = config.model ?? this.defaultModel
		this.observability?.onGenerationStart?.({ provider: PROVIDER, model, config })
		try {
			const response = await this.client.messages.create({
				model,
				max_tokens: config.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
				...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
				...(config.systemPrompt ? { system: config.systemPrompt } : {}),
				messages: [{ role: "user", content: stringifyUserPrompt(config.userPrompt) }]
			})

			const text = response.content
				.filter((block): block is Anthropic.TextBlock => block.type === "text")
				.map((block) => block.text)
				.join("")

			if (!text) {
				throw new LlmError(LlmErrorType.PARSING, PROVIDER, "Anthropic returned no text content")
			}

			const result: GenerationResult<string> = {
				content: text,
				usage: extractUsage(response.usage),
				provider: PROVIDER,
				model
			}
			this.observability?.onGenerationComplete?.(result)
			return result
		} catch (error) {
			const mapped = mapAnthropicError(error)
			this.observability?.onGenerationError?.(mapped)
			throw mapped
		}
	}

	protected async callGenerateStructured<T extends z.ZodTypeAny>(
		config: LlmGenerationConfig,
		schema: T,
		tool: { name: string; description: string }
	): Promise<GenerationResult<unknown>> {
		const model = config.model ?? this.defaultModel
		this.observability?.onGenerationStart?.({
			provider: PROVIDER,
			model,
			config,
			structuredTool: tool
		})
		// Cast: z.toJSONSchema returns a JSONSchema object, which is structurally
		// compatible with Anthropic's `input_schema` (a JSON Schema dialect).
		const inputSchema = z.toJSONSchema(schema, {
			target: "draft-07"
		}) as Anthropic.Tool.InputSchema
		const toolDef: Anthropic.Tool = {
			name: tool.name,
			description: tool.description,
			input_schema: inputSchema
		}

		try {
			const response = await this.client.messages.create({
				model,
				max_tokens: config.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
				...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
				...(config.systemPrompt ? { system: config.systemPrompt } : {}),
				messages: [{ role: "user", content: stringifyUserPrompt(config.userPrompt) }],
				tools: [toolDef],
				tool_choice: { type: "tool", name: tool.name }
			})

			const toolUse = response.content.find(
				(block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
			)
			if (!toolUse) {
				throw new LlmError(
					LlmErrorType.PARSING,
					PROVIDER,
					`Anthropic returned no tool_use block for forced tool "${tool.name}"`
				)
			}

			const result: GenerationResult<unknown> = {
				content: toolUse.input,
				usage: extractUsage(response.usage),
				provider: PROVIDER,
				model
			}
			this.observability?.onGenerationComplete?.(result)
			return result
		} catch (error) {
			const mapped = mapAnthropicError(error)
			this.observability?.onGenerationError?.(mapped)
			throw mapped
		}
	}
}

/** Surface Anthropic's per-call token counts in our provider-neutral shape. */
function extractUsage(usage: Anthropic.Usage): TokenUsage {
	return {
		inputTokens: usage.input_tokens,
		outputTokens: usage.output_tokens
	}
}

/** Coerce a `ContentBlock[]` user prompt down to text for the v1 text-only pipeline. */
function stringifyUserPrompt(prompt: LlmGenerationConfig["userPrompt"]): string {
	if (!prompt) return ""
	if (typeof prompt === "string") return prompt
	return prompt
		.filter((block) => block.type === "text")
		.map((block) => block.text)
		.join("\n")
}

/**
 * Translate an `Anthropic.APIError` subclass into an `LlmError` with the
 * right `LlmErrorType`. Anything we don't recognize falls through as
 * `UNKNOWN` — the retry loop treats those as non-retryable, which is the
 * safe default.
 */
function mapAnthropicError(error: unknown): LlmError {
	if (error instanceof LlmError) return error

	if (error instanceof Anthropic.RateLimitError) {
		return new LlmError(LlmErrorType.RATE_LIMIT, PROVIDER, error.message, error)
	}
	if (error instanceof Anthropic.AuthenticationError) {
		return new LlmError(LlmErrorType.AUTHENTICATION, PROVIDER, error.message, error)
	}
	if (error instanceof Anthropic.PermissionDeniedError) {
		return new LlmError(LlmErrorType.AUTHENTICATION, PROVIDER, error.message, error)
	}
	if (error instanceof Anthropic.NotFoundError) {
		return new LlmError(LlmErrorType.MODEL_NOT_FOUND, PROVIDER, error.message, error)
	}
	if (error instanceof Anthropic.InternalServerError) {
		return new LlmError(LlmErrorType.SERVICE_UNAVAILABLE, PROVIDER, error.message, error)
	}
	if (error instanceof Anthropic.APIConnectionTimeoutError) {
		return new LlmError(LlmErrorType.TIMEOUT, PROVIDER, error.message, error)
	}
	if (error instanceof Anthropic.APIConnectionError) {
		return new LlmError(LlmErrorType.NETWORK, PROVIDER, error.message, error)
	}
	if (error instanceof Anthropic.BadRequestError) {
		const type = /prompt is too long|max.*tokens/i.test(error.message)
			? LlmErrorType.TOKEN_LIMIT
			: LlmErrorType.UNKNOWN
		return new LlmError(type, PROVIDER, error.message, error)
	}
	if (error instanceof Anthropic.APIError) {
		// 529 = overloaded — Anthropic returns it outside the standard 5xx range.
		if (error.status === 529) {
			return new LlmError(LlmErrorType.SERVICE_UNAVAILABLE, PROVIDER, error.message, error)
		}
		return new LlmError(LlmErrorType.UNKNOWN, PROVIDER, error.message, error)
	}

	const message = error instanceof Error ? error.message : String(error)
	return new LlmError(LlmErrorType.UNKNOWN, PROVIDER, message, error)
}
