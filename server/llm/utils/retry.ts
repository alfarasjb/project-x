import { getRetryDelay, normalizeLlmError, sleep } from "@server/llm/errors/classify"

/**
 * Run `operation` with exponential-backoff retry on transient errors.
 * Non-retryable errors (auth, token-limit) throw immediately.
 *
 * - `maxRetries` is the number of *additional* attempts after the first
 *   (so `maxRetries: 3` ⇒ up to 4 calls in total).
 * - The retry delay is recomputed per attempt via `getRetryDelay`.
 * - Errors are normalized only for routing; the original is re-thrown so
 *   the upstream fallback loop sees the same shape it would have seen
 *   without retry in the middle.
 */
export async function executeWithRetry<T>(
	operation: () => Promise<T>,
	options: {
		provider: string
		maxRetries?: number
		operationName?: string
	}
): Promise<T> {
	const maxRetries = options.maxRetries ?? 3
	let lastError: unknown

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await operation()
		} catch (error) {
			lastError = error
			const normalized = normalizeLlmError(error, options.provider)

			if (!normalized.isRetryable || attempt === maxRetries) throw error

			const delay = getRetryDelay(normalized.type, attempt)
			console.warn(
				`[llm] ${options.operationName ?? "operation"} failed (${normalized.type} from ${normalized.provider}), retrying in ${Math.round(delay)}ms — attempt ${attempt + 1}/${maxRetries + 1}`
			)
			await sleep(delay)
		}
	}

	throw lastError
}
