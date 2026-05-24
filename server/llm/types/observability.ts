import type { LlmGenerationConfig } from "@server/llm/types/config"
import type { GenerationResult } from "@server/llm/types/result"

/**
 * Pluggable observability for LLM adapters. The adapter calls these
 * lifecycle hooks; the concrete implementation (e.g. `langfuseHook`)
 * decides what to do with them. Keeping this provider-agnostic means the
 * LLM package never imports a telemetry SDK directly — swap providers by
 * swapping the hook.
 *
 * All methods are optional: a hook that only cares about completion can
 * implement just `onGenerationComplete`. Embedding callbacks exist in
 * shape (used by PR B / Voyage) so the contract is ready when the
 * `EmbeddingAdapter` implementation lands.
 */
export interface ObservabilityHook {
	/** Generation about to start. Hook should set inputs on the active span. */
	onGenerationStart?(params: {
		provider: string
		model: string
		config: LlmGenerationConfig
		/** Schema name when this is a structured-output call; undefined for free-form. */
		structuredTool?: { name: string; description: string }
	}): void
	/** Generation succeeded. Hook should set outputs + usage on the active span. */
	onGenerationComplete?<T>(result: GenerationResult<T>): void
	/** Generation failed. Hook should record the error on the active span. */
	onGenerationError?(error: unknown): void

	/** Embedding about to start. Mirrors generation, for PR B / Voyage. */
	onEmbeddingStart?(params: { provider: string; model: string; input: string | string[] }): void
	/** Embedding succeeded. */
	onEmbeddingComplete?(result: {
		provider: string
		model: string
		dimensions: number
		usage?: { inputTokens?: number; totalTokens?: number }
	}): void
	/** Embedding failed. */
	onEmbeddingError?(error: unknown): void
}
