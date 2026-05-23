/**
 * Normalized LLM error type, independent of provider. Every provider's SDK
 * throws its own error hierarchy; we map them all to this enum so the retry
 * loop and the fallback loop can reason about errors uniformly.
 *
 * Two-axis classification (see `constants.ts`): an error is independently
 * marked "retryable on the same provider" and "fallback-eligible." Collapsing
 * these to a single boolean drops information (auth = neither; rate-limit =
 * both; model-not-found = fallback-but-not-retry).
 */
export enum LlmErrorType {
	RATE_LIMIT = "rate_limit",
	TOKEN_LIMIT = "token_limit",
	SERVICE_UNAVAILABLE = "service_unavailable",
	MODEL_NOT_FOUND = "model_not_found",
	AUTHENTICATION = "authentication",
	PARSING = "parsing",
	TIMEOUT = "timeout",
	NETWORK = "network",
	UNKNOWN = "unknown"
}

/**
 * Normalized LLM error. Wraps the original provider error as `cause` so
 * call sites can still inspect the raw thing in logs.
 */
export class LlmError extends Error {
	constructor(
		public readonly type: LlmErrorType,
		public readonly provider: string,
		message: string,
		public override readonly cause?: unknown
	) {
		super(message)
		this.name = "LlmError"
	}
}
