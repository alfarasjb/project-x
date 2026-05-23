import { AnthropicAdapter } from "@server/llm/adapters/anthropic"
import { env } from "@server/env"
import { FallbackLlmAdapter } from "@server/llm/fallback/adapter"
import {
	FALLBACK_CHAINS,
	TASK_CONFIGS,
	type ChainEntry,
	type Operation
} from "@server/llm/fallback/chains"
import type { LlmAdapter } from "@server/llm/types/adapter"

/**
 * Per-operation adapter cache. Operations share underlying provider adapter
 * instances (one HTTP client per provider), and the wrapping
 * `FallbackLlmAdapter` is cached too — re-creating it per call would defeat
 * the point of having a cache at all.
 *
 * Cache key is the operation name, not the chain identity: if the chain for
 * an operation changes at runtime (it can't today — chains are constants),
 * `clearAdapterCache()` is the explicit reset.
 */
const adapterCache = new Map<Operation, LlmAdapter>()
const providerCache = new Map<string, LlmAdapter>()

/** Get (or build) the adapter for an operation, wiring the configured chain. */
export function getAdapter(operation: Operation): LlmAdapter {
	const cached = adapterCache.get(operation)
	if (cached) return cached

	const chain = FALLBACK_CHAINS[operation]
	const resolved = chain.map((entry) => ({ entry, adapter: getProviderAdapter(entry) }))
	const adapter = new FallbackLlmAdapter(resolved, TASK_CONFIGS[operation], operation)
	adapterCache.set(operation, adapter)
	return adapter
}

function getProviderAdapter(entry: ChainEntry): LlmAdapter {
	const key = `${entry.provider}:${entry.model}`
	const cached = providerCache.get(key)
	if (cached) return cached
	const adapter = buildProviderAdapter(entry)
	providerCache.set(key, adapter)
	return adapter
}

function buildProviderAdapter(entry: ChainEntry): LlmAdapter {
	switch (entry.provider) {
		case "anthropic": {
			if (!env.ANTHROPIC_API_KEY) {
				throw new MissingProviderKeyError("anthropic", "ANTHROPIC_API_KEY")
			}
			return new AnthropicAdapter({ apiKey: env.ANTHROPIC_API_KEY, defaultModel: entry.model })
		}
		default: {
			// Exhaustive: `Provider` is `"anthropic"` today. The `never` makes adding
			// a new provider a compile error here until the case is handled.
			const exhaustive: never = entry.provider
			throw new Error(`Unhandled provider: ${exhaustive as string}`)
		}
	}
}

/**
 * Thrown when the factory is asked to build an adapter for a provider whose
 * API key isn't configured. Distinct from `LlmError` because it's a
 * deployment-config problem, not a per-call provider failure — callers
 * should map it to a 4xx, not retry it.
 */
export class MissingProviderKeyError extends Error {
	constructor(
		public readonly provider: string,
		public readonly envVar: string
	) {
		super(`Missing ${envVar} — set it to enable the ${provider} provider.`)
		this.name = "MissingProviderKeyError"
	}
}

/** Test seam — drops all cached adapters. Not used at runtime. */
export function clearAdapterCache(): void {
	adapterCache.clear()
	providerCache.clear()
}
