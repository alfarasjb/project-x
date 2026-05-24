import { VoyageAIClient, VoyageAIError, VoyageAITimeoutError } from "voyageai"
import { LlmError, LlmErrorType } from "@server/llm/errors/types"
import type { BaseAdapterConfig } from "@server/llm/types/config"
import type { EmbeddingAdapter } from "@server/llm/types/adapter"

const PROVIDER = "voyage"

/** Voyage caps `embed` input at 128 items per request; caller batches. */
export const VOYAGE_BATCH_LIMIT = 128

export interface VoyageConfig extends BaseAdapterConfig {
	apiKey: string
	/** Default embedding model when a call doesn't override. */
	defaultModel: string
	/** Output vector dimensionality (Voyage's `outputDimension`). */
	dimensions: number
}

/**
 * Voyage AI embedding adapter — one HTTP request per `embed` call.
 * Batching across N>128 items lives in the domain layer (same separation as
 * AnthropicAdapter, where per-node concurrency is `analyzeGraph`'s job).
 *
 * The observability hook is wrapped around the call so the active Langfuse
 * span (created by the caller's `observe()`) gets input + token usage
 * attached as an embedding observation.
 */
export class VoyageAdapter implements EmbeddingAdapter {
	private readonly client: VoyageAIClient
	private readonly defaultModel: string
	private readonly dimensions: number
	private readonly observability?: BaseAdapterConfig["observability"]

	constructor(config: VoyageConfig) {
		this.client = new VoyageAIClient({ apiKey: config.apiKey })
		this.defaultModel = config.defaultModel
		this.dimensions = config.dimensions
		this.observability = config.observability
	}

	async embed(config: { text: string | string[]; model?: string }): Promise<{
		embeddings: number[][]
		provider: string
		model: string
		dimensions: number
	}> {
		const model = config.model ?? this.defaultModel
		const inputs = Array.isArray(config.text) ? config.text : [config.text]
		if (inputs.length === 0) {
			return { embeddings: [], provider: PROVIDER, model, dimensions: this.dimensions }
		}
		if (inputs.length > VOYAGE_BATCH_LIMIT) {
			throw new LlmError(
				LlmErrorType.UNKNOWN,
				PROVIDER,
				`Voyage embed: batch of ${inputs.length} exceeds limit of ${VOYAGE_BATCH_LIMIT}. Caller must split.`
			)
		}

		this.observability?.onEmbeddingStart?.({ provider: PROVIDER, model, input: inputs })

		try {
			const response = await this.client.embed({
				input: inputs,
				model,
				outputDimension: this.dimensions,
				inputType: "document"
			})

			// Voyage returns data in request order but each item carries an
			// `index` field — sort defensively so a non-stable backend ordering
			// can't silently misalign embeddings with their source rows.
			const sorted = (response.data ?? []).slice().sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
			const embeddings = sorted.map((item, i) => {
				if (!item.embedding) {
					throw new LlmError(
						LlmErrorType.PARSING,
						PROVIDER,
						`Voyage returned no embedding for input ${i}`
					)
				}
				return item.embedding
			})

			if (embeddings.length !== inputs.length) {
				throw new LlmError(
					LlmErrorType.PARSING,
					PROVIDER,
					`Voyage returned ${embeddings.length} embeddings for ${inputs.length} inputs`
				)
			}

			this.observability?.onEmbeddingComplete?.({
				provider: PROVIDER,
				model,
				dimensions: this.dimensions,
				usage: { totalTokens: response.usage?.totalTokens }
			})

			return { embeddings, provider: PROVIDER, model, dimensions: this.dimensions }
		} catch (error) {
			const mapped = mapVoyageError(error)
			this.observability?.onEmbeddingError?.(mapped)
			throw mapped
		}
	}
}

/**
 * Translate Voyage SDK errors into our provider-neutral `LlmError`. The SDK
 * surface is much smaller than Anthropic's (just `VoyageAIError` +
 * `VoyageAITimeoutError`), so we lean on the HTTP status to pick the type.
 */
function mapVoyageError(error: unknown): LlmError {
	if (error instanceof LlmError) return error
	if (error instanceof VoyageAITimeoutError) {
		return new LlmError(LlmErrorType.TIMEOUT, PROVIDER, error.message, error)
	}
	if (error instanceof VoyageAIError) {
		const status = error.statusCode
		if (status === 401 || status === 403) {
			return new LlmError(LlmErrorType.AUTHENTICATION, PROVIDER, error.message, error)
		}
		if (status === 404) {
			return new LlmError(LlmErrorType.MODEL_NOT_FOUND, PROVIDER, error.message, error)
		}
		if (status === 429) {
			return new LlmError(LlmErrorType.RATE_LIMIT, PROVIDER, error.message, error)
		}
		if (status !== undefined && status >= 500) {
			return new LlmError(LlmErrorType.SERVICE_UNAVAILABLE, PROVIDER, error.message, error)
		}
		if (status === 400 && /token|length|too long/i.test(error.message)) {
			return new LlmError(LlmErrorType.TOKEN_LIMIT, PROVIDER, error.message, error)
		}
		return new LlmError(LlmErrorType.UNKNOWN, PROVIDER, error.message, error)
	}
	const message = error instanceof Error ? error.message : String(error)
	return new LlmError(LlmErrorType.UNKNOWN, PROVIDER, message, error)
}
