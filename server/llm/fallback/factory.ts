import Anthropic from "@anthropic-ai/sdk"
import { AnthropicAdapter } from "@server/llm/adapters/anthropic"
import { AnthropicAgentAdapter } from "@server/llm/adapters/anthropic-agent"
import { VoyageAdapter } from "@server/llm/adapters/voyage"
import { env } from "@server/env"
import { FallbackLlmAdapter } from "@server/llm/fallback/adapter"
import {
	EMBEDDING_CHAINS,
	FALLBACK_CHAINS,
	TASK_CONFIGS,
	type AgentOperation,
	type ChainEntry,
	type EmbeddingChainEntry,
	type EmbeddingOperation,
	type LlmOperation,
	type TaskConfig
} from "@server/llm/fallback/chains"
import type { AgentAdapter } from "@server/llm/types/agent-adapter"
import type { EmbeddingAdapter, LlmAdapter } from "@server/llm/types/adapter"
import type { ObservabilityHook } from "@server/llm/types/observability"
import { langfuseHook } from "@server/observability/langfuse-hook"

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
const adapterCache = new Map<LlmOperation, LlmAdapter>()
const providerCache = new Map<string, LlmAdapter>()
const agentAdapterCache = new Map<AgentOperation, AgentAdapter>()
const embeddingAdapterCache = new Map<EmbeddingOperation, EmbeddingAdapter>()
const embeddingProviderCache = new Map<string, EmbeddingAdapter>()

/** Get (or build) the 1-shot adapter for an operation, wiring the configured chain. */
export function getAdapter(operation: LlmOperation): LlmAdapter {
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
	const observability = getObservabilityHook()
	switch (entry.provider) {
		case "anthropic": {
			if (!env.ANTHROPIC_API_KEY) {
				throw new MissingProviderKeyError("anthropic", "ANTHROPIC_API_KEY")
			}
			return new AnthropicAdapter({
				apiKey: env.ANTHROPIC_API_KEY,
				defaultModel: entry.model,
				observability
			})
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
 * Get (or build) the multi-step agent adapter for an operation. No fallback
 * wrapping in v1: agent chains are length-1 (Anthropic-only), so we return the
 * underlying adapter directly. A `FallbackAgentAdapter` is the right move when a
 * second provider arrives, not before. Shares the per-operation cache pattern
 * with `getAdapter` but a separate cache because the returned type differs.
 */
export function getAgentAdapter(operation: AgentOperation): AgentAdapter {
	const cached = agentAdapterCache.get(operation)
	if (cached) return cached
	const entry = FALLBACK_CHAINS[operation][0]
	if (!entry) {
		throw new Error(`No chain configured for agent operation "${operation}"`)
	}
	// Bake the per-operation TaskConfig (temperature + token budget) into the
	// adapter as its per-call defaults — the same config the 1-shot path applies
	// via FallbackLlmAdapter. Cached per operation, since two operations can
	// share a model but want different knobs.
	const adapter = buildAgentProviderAdapter(entry, operation, TASK_CONFIGS[operation])
	agentAdapterCache.set(operation, adapter)
	return adapter
}

function buildAgentProviderAdapter(
	entry: ChainEntry,
	operation: AgentOperation,
	defaults: TaskConfig
): AgentAdapter {
	switch (entry.provider) {
		case "anthropic": {
			if (!env.ANTHROPIC_API_KEY) {
				throw new MissingProviderKeyError("anthropic", "ANTHROPIC_API_KEY")
			}
			// Same observability gating as the 1-shot path: the hook enriches a
			// Langfuse generation span the adapter opens per loop. Undefined when
			// keys are unset, so `observe()` is a passthrough.
			return new AnthropicAgentAdapter(
				{
					apiKey: env.ANTHROPIC_API_KEY,
					defaultModel: entry.model,
					observability: getObservabilityHook()
				},
				defaults,
				operation
			)
		}
		default: {
			const exhaustive: never = entry.provider
			throw new Error(`Unhandled provider: ${exhaustive as string}`)
		}
	}
}

/**
 * A configured Anthropic client plus the resolved model + per-call config for a
 * streaming agent operation. The hand-wired loop in `server/agent/` needs the raw
 * client (to call `messages.stream`), not the batch `AgentAdapter` — but it still
 * draws its model id + knobs from the central registry, so model upgrades stay a
 * one-line edit in `chains.ts`.
 */
export interface AnthropicAgentRuntime {
	client: Anthropic
	model: string
	taskConfig: TaskConfig
}

/** One Anthropic HTTP client, shared by every streaming agent operation. */
let streamingAnthropicClient: Anthropic | null = null

function getStreamingAnthropicClient(): Anthropic {
	if (!env.ANTHROPIC_API_KEY) {
		throw new MissingProviderKeyError("anthropic", "ANTHROPIC_API_KEY")
	}
	streamingAnthropicClient ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
	return streamingAnthropicClient
}

/**
 * Resolve the streaming runtime for an agent operation: the shared Anthropic
 * client + the operation's configured model + its `TaskConfig`. Distinct from
 * `getAgentAdapter`, which returns the batch (terminal-tool) `AgentAdapter` —
 * the wrong contract for an open-ended streaming chat loop. Anthropic-only today;
 * the `never` keeps adding a provider a compile error here until it's handled.
 */
export function getStreamingAgentRuntime(operation: AgentOperation): AnthropicAgentRuntime {
	const entry = FALLBACK_CHAINS[operation][0]
	if (!entry) {
		throw new Error(`No chain configured for agent operation "${operation}"`)
	}
	switch (entry.provider) {
		case "anthropic":
			return {
				client: getStreamingAnthropicClient(),
				model: entry.model,
				taskConfig: TASK_CONFIGS[operation]
			}
		default: {
			const exhaustive: never = entry.provider
			throw new Error(`Streaming agent runtime: unhandled provider ${exhaustive as string}`)
		}
	}
}

/**
 * Get (or build) the embedding adapter for an embedding operation. v1 has no
 * fallback chain (one entry per operation), so this returns the underlying
 * adapter directly rather than wrapping it — adding a `FallbackEmbeddingAdapter`
 * is the right move when there's a second provider, not before.
 */
export function getEmbeddingAdapter(operation: EmbeddingOperation): EmbeddingAdapter {
	const cached = embeddingAdapterCache.get(operation)
	if (cached) return cached
	const chain = EMBEDDING_CHAINS[operation]
	const entry = chain[0]
	if (!entry) {
		throw new Error(`No embedding chain configured for operation "${operation}"`)
	}
	const adapter = getEmbeddingProviderAdapter(entry)
	embeddingAdapterCache.set(operation, adapter)
	return adapter
}

function getEmbeddingProviderAdapter(entry: EmbeddingChainEntry): EmbeddingAdapter {
	const key = `${entry.provider}:${entry.model}:${entry.dimensions}`
	const cached = embeddingProviderCache.get(key)
	if (cached) return cached
	const adapter = buildEmbeddingProviderAdapter(entry)
	embeddingProviderCache.set(key, adapter)
	return adapter
}

function buildEmbeddingProviderAdapter(entry: EmbeddingChainEntry): EmbeddingAdapter {
	const observability = getObservabilityHook()
	switch (entry.provider) {
		case "voyage": {
			if (!env.VOYAGE_API_KEY) {
				throw new MissingProviderKeyError("voyage", "VOYAGE_API_KEY")
			}
			return new VoyageAdapter({
				apiKey: env.VOYAGE_API_KEY,
				defaultModel: entry.model,
				dimensions: entry.dimensions,
				observability
			})
		}
		default: {
			const exhaustive: never = entry.provider
			throw new Error(`Unhandled embedding provider: ${exhaustive as string}`)
		}
	}
}

/**
 * Wire Langfuse only when its keys are configured. Without keys the tracing
 * bootstrap never registers a TracerProvider, so the hook's
 * `updateActiveObservation` calls would silently no-op anyway — but skipping
 * the hook entirely keeps the call stack clean and the adapter trivially
 * inspectable.
 */
function getObservabilityHook(): ObservabilityHook | undefined {
	if (!env.LANGFUSE_PUBLIC_KEY || !env.LANGFUSE_SECRET_KEY) return undefined
	return langfuseHook
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
	agentAdapterCache.clear()
	embeddingAdapterCache.clear()
	embeddingProviderCache.clear()
	streamingAnthropicClient = null
}
