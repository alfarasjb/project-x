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
}

/** Provider-specific construction config. Each adapter takes its own shape. */
export interface AnthropicConfig {
	apiKey: string
	/** Default model when a call doesn't override. */
	defaultModel: string
}
