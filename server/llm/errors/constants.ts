import { LlmErrorType } from "@server/llm/errors/types"

/**
 * Errors worth retrying on the *same* provider — transient or content-shaped
 * problems where a second attempt has a real chance of succeeding.
 *
 * AUTH and TOKEN_LIMIT are deliberately absent: bad creds don't fix themselves,
 * and the same oversized input won't shrink on retry.
 */
export const RETRYABLE_ERROR_TYPES: ReadonlySet<LlmErrorType> = new Set([
	LlmErrorType.RATE_LIMIT,
	LlmErrorType.SERVICE_UNAVAILABLE,
	LlmErrorType.TIMEOUT,
	LlmErrorType.NETWORK,
	LlmErrorType.PARSING
])

/**
 * Errors worth falling back to the *next* provider in the chain.
 *
 * AUTH and TOKEN_LIMIT are deliberately absent for the same reason as above:
 * same creds + same input will fail on the next provider too.
 */
export const FALLBACK_ERROR_TYPES: ReadonlySet<LlmErrorType> = new Set([
	LlmErrorType.RATE_LIMIT,
	LlmErrorType.SERVICE_UNAVAILABLE,
	LlmErrorType.MODEL_NOT_FOUND,
	LlmErrorType.PARSING
])

/** Per-type backoff knobs. baseDelay × 2^attempt, capped at maxDelay, plus jitter. */
export interface RetryConfig {
	baseDelay: number
	maxDelay: number
	useJitter: boolean
}

export const RETRY_CONFIG: Record<LlmErrorType, RetryConfig> = {
	[LlmErrorType.RATE_LIMIT]: { baseDelay: 1000, maxDelay: 30000, useJitter: true },
	[LlmErrorType.SERVICE_UNAVAILABLE]: { baseDelay: 5000, maxDelay: 60000, useJitter: true },
	[LlmErrorType.TIMEOUT]: { baseDelay: 2000, maxDelay: 10000, useJitter: false },
	[LlmErrorType.NETWORK]: { baseDelay: 500, maxDelay: 5000, useJitter: true },
	[LlmErrorType.PARSING]: { baseDelay: 500, maxDelay: 3000, useJitter: true },
	// Non-retryable types still have an entry so the table is total.
	[LlmErrorType.MODEL_NOT_FOUND]: { baseDelay: 0, maxDelay: 0, useJitter: false },
	[LlmErrorType.TOKEN_LIMIT]: { baseDelay: 0, maxDelay: 0, useJitter: false },
	[LlmErrorType.AUTHENTICATION]: { baseDelay: 0, maxDelay: 0, useJitter: false },
	[LlmErrorType.UNKNOWN]: { baseDelay: 1000, maxDelay: 10000, useJitter: true }
}
