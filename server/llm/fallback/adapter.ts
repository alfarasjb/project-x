import type { z } from "zod"
import type { LlmAdapter } from "@server/llm/types/adapter"
import type { LlmGenerationConfig } from "@server/llm/types/config"
import type { GenerationResult } from "@server/llm/types/result"
import { normalizeLlmError } from "@server/llm/errors/classify"
import type { ChainEntry, Operation, TaskConfig } from "@server/llm/fallback/chains"

/**
 * Walks the fallback chain on every call. The retry-on-same-provider loop
 * lives in the base adapter; this loop handles "give up on this provider,
 * try the next one." An error only triggers fallback if `shouldFallback`
 * is true (rate limit, 5xx, model-not-found, parsing) — auth and token
 * limits short-circuit immediately because the next provider will hit the
 * same wall.
 *
 * Today every chain is length 1, so fallback is a future-proof shape rather
 * than an active code path. The structure makes "add a Sonnet fallback"
 * or "add OpenAI" a one-line change in `FALLBACK_CHAINS`.
 */
export class FallbackLlmAdapter implements LlmAdapter {
	constructor(
		private readonly chain: readonly { entry: ChainEntry; adapter: LlmAdapter }[],
		private readonly defaults: TaskConfig,
		private readonly operation: Operation
	) {
		if (chain.length === 0) {
			throw new Error(`FallbackLlmAdapter: chain is empty for operation "${operation}"`)
		}
	}

	async generate(config: LlmGenerationConfig): Promise<GenerationResult<string>> {
		return this.runChain((adapter, model) =>
			adapter.generate({ ...this.applyDefaults(config), model })
		)
	}

	async generateStructured<T extends z.ZodTypeAny>(
		config: LlmGenerationConfig,
		schema: T,
		tool: { name: string; description: string }
	): Promise<GenerationResult<z.infer<T>>> {
		return this.runChain((adapter, model) =>
			adapter.generateStructured({ ...this.applyDefaults(config), model }, schema, tool)
		)
	}

	private applyDefaults(config: LlmGenerationConfig): LlmGenerationConfig {
		return {
			...config,
			temperature: config.temperature ?? this.defaults.temperature,
			maxOutputTokens: config.maxOutputTokens ?? this.defaults.maxOutputTokens
		}
	}

	private async runChain<R>(call: (adapter: LlmAdapter, model: string) => Promise<R>): Promise<R> {
		let lastError: unknown
		for (let i = 0; i < this.chain.length; i++) {
			const link = this.chain[i]
			if (!link) continue
			const isLast = i === this.chain.length - 1
			try {
				return await call(link.adapter, link.entry.model)
			} catch (error) {
				lastError = error
				const normalized = normalizeLlmError(error, link.entry.provider)
				console.warn(
					`[llm] ${this.operation} ${link.entry.provider}/${link.entry.model} failed (${normalized.type}): ${normalized.message}`
				)
				if (isLast) throw error
				if (!normalized.shouldFallback) throw error
				const next = this.chain[i + 1]
				if (next) {
					console.warn(
						`[llm] ${this.operation} → falling back to ${next.entry.provider}/${next.entry.model}`
					)
				}
			}
		}
		throw lastError
	}
}
