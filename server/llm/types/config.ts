import type { ContentBlock } from "@server/llm/types/messages"

/**
 * Config for a single generation call. `model` overrides the adapter's
 * default; everything else is optional and falls back to per-operation
 * defaults set by the factory.
 */
export interface LlmGenerationConfig {
	systemPrompt?: string
	userPrompt?: string | ContentBlock[]
	model?: string
	/** 0-1; lower = more deterministic. Default is per-operation. */
	temperature?: number
	/** Max output tokens. Default is per-operation. */
	maxOutputTokens?: number
	/**
	 * Mark the system prompt + tool definitions as cacheable (Anthropic
	 * `cache_control: ephemeral`). Set this only for high-fanout operations
	 * where the same system prompt fires across many calls — analyze is the
	 * canonical case. The first call pays a ~25% write surcharge; subsequent
	 * calls within the 5-minute TTL read the cached chunk at 10% of normal
	 * input cost. Anthropic silently no-ops below a model-specific token
	 * minimum (Haiku 4.5 ⇒ 2048 tokens), so a too-short prompt costs
	 * nothing extra but also saves nothing.
	 */
	cacheSystemPrompt?: boolean
}

/** Provider-specific construction config. Each adapter takes its own shape. */
export interface AnthropicConfig {
	apiKey: string
	/** Default model when a call doesn't override. */
	defaultModel: string
}
