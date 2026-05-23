import type { z } from "zod"
import type { LlmGenerationConfig } from "@server/llm/types/config"
import type { GenerationResult } from "@server/llm/types/result"

/**
 * Chat / completion adapter. Strictly 1-shot — input → output, no tools,
 * no iteration. Adding agent loops will be a separate `AgentAdapter`
 * interface, not a mutation of this one.
 *
 * `generateStructured` is the workhorse: the adapter is responsible for
 * forcing the model into the schema (Anthropic uses tool_use under the
 * hood) so call sites get parsed, validated output back.
 */
export interface LlmAdapter {
	generate(config: LlmGenerationConfig): Promise<GenerationResult<string>>
	generateStructured<T extends z.ZodTypeAny>(
		config: LlmGenerationConfig,
		schema: T,
		/** Name + description for the synthetic tool the model is forced into. */
		tool: { name: string; description: string }
	): Promise<GenerationResult<z.infer<T>>>
}

/**
 * Embedding adapter. Separate from `LlmAdapter` because Anthropic has no
 * embedding endpoint — embeddings are PR B (Voyage AI). The interface lives
 * here so PR B doesn't have to invent it.
 */
export interface EmbeddingAdapter {
	embed(config: { text: string | string[]; model?: string }): Promise<{
		embeddings: number[][]
		provider: string
		model: string
		dimensions: number
	}>
}
