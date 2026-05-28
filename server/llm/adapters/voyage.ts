import { LlmError, LlmErrorType } from "@server/llm/errors/types"
import type { BaseAdapterConfig } from "@server/llm/types/adapter-config"
import type { EmbeddingAdapter } from "@server/llm/types/adapter"

const PROVIDER = "voyage"
const DEFAULT_BASE_URL = "https://api.voyageai.com/v1"

/** Voyage caps `embed` input at 128 items per request; caller batches. */
export const VOYAGE_BATCH_LIMIT = 128

export interface VoyageConfig extends BaseAdapterConfig {
	apiKey: string
	/** Default embedding model when a call doesn't override. */
	defaultModel: string
	/** Output vector dimensionality (Voyage's `output_dimension`). */
	dimensions: number
	/** Override the API base URL (testing / proxy). Defaults to api.voyageai.com/v1. */
	baseUrl?: string
}

/**
 * Voyage AI embedding adapter — talks to `/v1/embeddings` directly via
 * `fetch`. We deliberately don't use the official `voyageai` npm SDK:
 * v0.2.1's ESM build has unextended imports (`from "../api"`) that fail
 * under Node strict ESM resolution. The HTTP surface is one endpoint with
 * a stable JSON shape, so reaching for fetch is both simpler and removes
 * a fragile dependency.
 *
 * One HTTP request per `embed` call. Batching across N>128 items lives in
 * the domain layer (same separation as AnthropicAdapter, where per-node
 * concurrency is `analyzeGraph`'s job).
 *
 * The observability hook wraps the call so the active Langfuse span
 * (created by the caller's `observe()`) gets input + token usage attached
 * as an embedding observation.
 */
export class VoyageAdapter implements EmbeddingAdapter {
	private readonly apiKey: string
	private readonly defaultModel: string
	private readonly dimensions: number
	private readonly baseUrl: string
	private readonly observability?: BaseAdapterConfig["observability"]

	constructor(config: VoyageConfig) {
		this.apiKey = config.apiKey
		this.defaultModel = config.defaultModel
		this.dimensions = config.dimensions
		this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL
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
			const response = await fetch(`${this.baseUrl}/embeddings`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${this.apiKey}`,
					"Content-Type": "application/json"
				},
				body: JSON.stringify({
					input: inputs,
					model,
					input_type: "document",
					output_dimension: this.dimensions
				})
			})

			if (!response.ok) {
				throw await responseError(response)
			}

			const body = (await response.json()) as VoyageEmbedResponse
			// Voyage returns data in request order but each item carries an
			// `index` field — sort defensively so a non-stable backend ordering
			// can't silently misalign embeddings with their source rows.
			const sorted = (body.data ?? []).slice().sort((a, b) => a.index - b.index)
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
				// For embeddings there are no output tokens — Voyage's `total_tokens`
				// IS the input count. Report it as both so Langfuse's cost engine
				// (which multiplies `usageDetails.input` by the per-token price)
				// gets a non-zero value once the model is registered in the UI.
				usage: {
					inputTokens: body.usage?.total_tokens,
					totalTokens: body.usage?.total_tokens
				}
			})

			return { embeddings, provider: PROVIDER, model, dimensions: this.dimensions }
		} catch (error) {
			if (error instanceof LlmError) {
				this.observability?.onEmbeddingError?.(error)
				throw error
			}
			const wrapped = new LlmError(
				LlmErrorType.NETWORK,
				PROVIDER,
				error instanceof Error ? error.message : String(error),
				error
			)
			this.observability?.onEmbeddingError?.(wrapped)
			throw wrapped
		}
	}
}

interface VoyageEmbedResponse {
	object?: string
	data?: { object?: string; embedding?: number[]; index: number }[]
	model?: string
	usage?: { total_tokens?: number }
}

/**
 * Map a non-2xx Voyage response to an `LlmError`. The API documents standard
 * HTTP semantics: 401/403 = auth, 404 = bad model, 429 = rate limit, 5xx =
 * service. 400 body messages mentioning tokens or length signal the input
 * blew past the per-batch token cap.
 */
async function responseError(response: Response): Promise<LlmError> {
	let bodyText = ""
	try {
		bodyText = await response.text()
	} catch {
		// Body unreadable — fall back to the status line.
	}
	const message = `Voyage ${response.status} ${response.statusText}${bodyText ? `: ${bodyText.slice(0, 500)}` : ""}`

	if (response.status === 401 || response.status === 403) {
		return new LlmError(LlmErrorType.AUTHENTICATION, PROVIDER, message)
	}
	if (response.status === 404) {
		return new LlmError(LlmErrorType.MODEL_NOT_FOUND, PROVIDER, message)
	}
	if (response.status === 429) {
		return new LlmError(LlmErrorType.RATE_LIMIT, PROVIDER, message)
	}
	if (response.status >= 500) {
		return new LlmError(LlmErrorType.SERVICE_UNAVAILABLE, PROVIDER, message)
	}
	if (response.status === 400 && /token|length|too long/i.test(bodyText)) {
		return new LlmError(LlmErrorType.TOKEN_LIMIT, PROVIDER, message)
	}
	return new LlmError(LlmErrorType.UNKNOWN, PROVIDER, message)
}
