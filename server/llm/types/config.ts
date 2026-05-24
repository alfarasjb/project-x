import type { ContentBlock } from "@server/llm/types/messages"
import type { ObservabilityHook } from "@server/llm/types/observability"

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

/**
 * Construction-time options shared by every provider adapter. Currently just
 * the observability hook; lives in its own type so future shared options
 * (default headers, request-id correlation) have an obvious home.
 */
export interface BaseAdapterConfig {
	/** Optional telemetry hook called around every provider call. */
	observability?: ObservabilityHook
}

/** Provider-specific construction config. Each adapter takes its own shape. */
export interface AnthropicConfig extends BaseAdapterConfig {
	apiKey: string
	/** Default model when a call doesn't override. */
	defaultModel: string
}
