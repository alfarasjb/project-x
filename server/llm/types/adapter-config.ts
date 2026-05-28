import type { ObservabilityHook } from "@server/llm/types/observability"

/**
 * Construction-time options shared by every provider adapter. Currently just
 * the observability hook; lives in its own type so future shared options
 * (default headers, request-id correlation) have an obvious home.
 *
 * Kept separate from `LlmGenerationConfig` (per-call config) so the
 * generation-config layer stays free of any observability dependency — the
 * hook observes generation, so observability depends on config, never the
 * other way around.
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
