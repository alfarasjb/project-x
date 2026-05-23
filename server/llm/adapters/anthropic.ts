import Anthropic from "@anthropic-ai/sdk"
import { z } from "zod"
import { BaseLlmAdapter } from "@server/llm/adapters/base"
import { LlmError, LlmErrorType } from "@server/llm/errors/types"
import type { AnthropicConfig, LlmGenerationConfig } from "@server/llm/types/config"
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

	constructor(config: AnthropicConfig) {
		super()
		this.client = new Anthropic({ apiKey: config.apiKey })
		this.defaultModel = config.defaultModel
	}

	protected async callGenerate(config: LlmGenerationConfig): Promise<GenerationResult<string>> {
		const model = config.model ?? this.defaultModel
		try {
			const response = await this.client.messages.create({
				model,
				max_tokens: config.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
				...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
				...buildSystem(config),
				messages: [{ role: "user", content: stringifyUserPrompt(config.userPrompt) }]
			})

			const text = response.content
				.filter((block): block is Anthropic.TextBlock => block.type === "text")
				.map((block) => block.text)
				.join("")

			if (!text) {
				throw new LlmError(LlmErrorType.PARSING, PROVIDER, "Anthropic returned no text content")
			}

			return {
				content: text,
				usage: extractUsage(response.usage),
				provider: PROVIDER,
				model
			}
		} catch (error) {
			throw mapAnthropicError(error)
		}
	}

	protected async callGenerateStructured<T extends z.ZodTypeAny>(
		config: LlmGenerationConfig,
		schema: T,
		tool: { name: string; description: string }
	): Promise<GenerationResult<unknown>> {
		const model = config.model ?? this.defaultModel
		// Cast: z.toJSONSchema returns a JSONSchema object, which is structurally
		// compatible with Anthropic's `input_schema` (a JSON Schema dialect).
		const inputSchema = z.toJSONSchema(schema, {
			target: "draft-07"
		}) as Anthropic.Tool.InputSchema
		const toolDef: Anthropic.Tool = {
			name: tool.name,
			description: tool.description,
			input_schema: inputSchema,
			// Marking the last tool entry as cacheable caches the entire tools
			// array. Same threshold/silent-skip semantics as the system prompt.
			...(config.cacheSystemPrompt ? { cache_control: { type: "ephemeral" } } : {})
		}

		try {
			const response = await this.client.messages.create({
				model,
				max_tokens: config.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
				...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
				...buildSystem(config),
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

			return {
				content: toolUse.input,
				usage: extractUsage(response.usage),
				provider: PROVIDER,
				model
			}
		} catch (error) {
			throw mapAnthropicError(error)
		}
	}
}

/**
 * Surface Anthropic's per-call token counts in our provider-neutral shape.
 * `cache_creation_input_tokens` / `cache_read_input_tokens` are present only
 * when prompt caching took effect — we omit them otherwise so non-caching
 * callers don't see noisy zeros.
 */
function extractUsage(usage: Anthropic.Usage): TokenUsage {
	return {
		inputTokens: usage.input_tokens,
		outputTokens: usage.output_tokens,
		...(usage.cache_creation_input_tokens
			? { cacheCreationTokens: usage.cache_creation_input_tokens }
			: {}),
		...(usage.cache_read_input_tokens ? { cacheReadTokens: usage.cache_read_input_tokens } : {})
	}
}

/**
 * Build the `system` field for a Messages call. When `cacheSystemPrompt`
 * is set we send the structured block form so we can attach
 * `cache_control`; otherwise we pass the plain string the SDK accepts as a
 * shortcut. Returns an empty partial when no system prompt is provided so
 * the caller can spread it unconditionally.
 */
function buildSystem(
	config: LlmGenerationConfig
): { system: string | Anthropic.TextBlockParam[] } | Record<string, never> {
	if (!config.systemPrompt) return {}
	if (!config.cacheSystemPrompt) return { system: config.systemPrompt }
	return {
		system: [
			{
				type: "text",
				text: config.systemPrompt,
				cache_control: { type: "ephemeral" }
			}
		]
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
