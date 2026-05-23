/** Token accounting for a single LLM call. Per-call only — aggregation is the caller's job. */
export interface TokenUsage {
	inputTokens: number
	outputTokens: number
}

/**
 * The result of a single LLM call. `content` is generic so structured generation
 * returns the typed Zod output and free-form generation returns a string.
 */
export interface GenerationResult<T> {
	content: T
	usage: TokenUsage
	/** Provider that fulfilled the call — useful for telemetry and tests. */
	provider: string
	/** Exact model id (matters for cost attribution + diagnosing regressions). */
	model: string
}
