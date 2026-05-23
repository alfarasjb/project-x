import type { z } from "zod"
import type { LlmAdapter } from "@server/llm/types/adapter"
import type { LlmGenerationConfig } from "@server/llm/types/config"
import type { GenerationResult } from "@server/llm/types/result"
import { LlmError, LlmErrorType } from "@server/llm/errors/types"
import { executeWithRetry } from "@server/llm/utils/retry"

/**
 * Template adapter — wires each provider into the retry loop and the
 * shared Zod-validation path, so concrete adapters only have to implement
 * the actual provider call (`callGenerate` / `callGenerateStructured`).
 *
 * Concrete adapters are responsible for translating provider-specific
 * errors into `LlmError` instances before they bubble up — that's where
 * `LlmErrorType` gets assigned. The retry loop trusts the tag.
 */
export abstract class BaseLlmAdapter implements LlmAdapter {
	abstract readonly provider: string

	async generate(config: LlmGenerationConfig): Promise<GenerationResult<string>> {
		return executeWithRetry(() => this.callGenerate(config), {
			provider: this.provider,
			operationName: "generate"
		})
	}

	async generateStructured<T extends z.ZodTypeAny>(
		config: LlmGenerationConfig,
		schema: T,
		tool: { name: string; description: string }
	): Promise<GenerationResult<z.infer<T>>> {
		return executeWithRetry(
			async () => {
				const raw = await this.callGenerateStructured(config, schema, tool)
				const parsed = schema.safeParse(raw.content)
				if (!parsed.success) {
					throw new LlmError(
						LlmErrorType.PARSING,
						this.provider,
						`Structured output failed schema validation: ${parsed.error.message}`,
						parsed.error
					)
				}
				return { ...raw, content: parsed.data as z.infer<T> }
			},
			{ provider: this.provider, operationName: "generateStructured" }
		)
	}

	/** Provider-specific text generation. Throws `LlmError` on failure. */
	protected abstract callGenerate(config: LlmGenerationConfig): Promise<GenerationResult<string>>

	/**
	 * Provider-specific structured generation. Returns the raw decoded tool
	 * input as `unknown` — the base class re-validates with the schema, so
	 * a provider drift can't bypass validation. Throws `LlmError` on failure.
	 */
	protected abstract callGenerateStructured<T extends z.ZodTypeAny>(
		config: LlmGenerationConfig,
		schema: T,
		tool: { name: string; description: string }
	): Promise<GenerationResult<unknown>>
}
