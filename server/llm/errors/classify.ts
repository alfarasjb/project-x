import {
	FALLBACK_ERROR_TYPES,
	RETRYABLE_ERROR_TYPES,
	RETRY_CONFIG
} from "@server/llm/errors/constants"
import { LlmError, LlmErrorType } from "@server/llm/errors/types"

/**
 * Verdict on a single error: what kind it is, whether to retry on the same
 * provider, whether to fall back to the next one, and how long to wait
 * before the next attempt.
 */
export interface NormalizedLlmError {
	type: LlmErrorType
	provider: string
	isRetryable: boolean
	shouldFallback: boolean
	/** Backoff in ms for the *first* retry; `executeWithRetry` recomputes per attempt. */
	suggestedDelay: number
	message: string
	cause: unknown
}

/** Calculate retry delay with exponential backoff + jitter. Attempt is 0-indexed. */
export function getRetryDelay(type: LlmErrorType, attempt: number): number {
	const config = RETRY_CONFIG[type]
	const exponential = config.baseDelay * Math.pow(2, attempt)
	const capped = Math.min(exponential, config.maxDelay)
	if (!config.useJitter) return capped
	// 0-10% jitter, capped at 1s — prevents synchronized thundering herd on retry.
	return capped + Math.random() * Math.min(1000, capped * 0.1)
}

/** Promise-based sleep. */
export function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Normalize whatever the provider threw into the shape the retry/fallback
 * loops consume. If it's already an `LlmError` (the adapter mapped it),
 * trust the type tag; otherwise mark it `UNKNOWN`.
 *
 * Adapters are expected to wrap provider errors themselves — this function
 * is the safety net for things that slip through (e.g. a thrown string,
 * a `ZodError` from `parseWithSchema`).
 */
export function normalizeLlmError(error: unknown, provider: string): NormalizedLlmError {
	if (error instanceof LlmError) {
		return {
			type: error.type,
			provider: error.provider,
			isRetryable: RETRYABLE_ERROR_TYPES.has(error.type),
			shouldFallback: FALLBACK_ERROR_TYPES.has(error.type),
			suggestedDelay: getRetryDelay(error.type, 0),
			message: error.message,
			cause: error.cause
		}
	}

	// Zod failures from `parseWithSchema` reach us as `ZodError`.
	const message = error instanceof Error ? error.message : String(error)
	const type =
		error instanceof Error && error.name === "ZodError"
			? LlmErrorType.PARSING
			: LlmErrorType.UNKNOWN
	return {
		type,
		provider,
		isRetryable: RETRYABLE_ERROR_TYPES.has(type),
		shouldFallback: FALLBACK_ERROR_TYPES.has(type),
		suggestedDelay: getRetryDelay(type, 0),
		message,
		cause: error
	}
}
