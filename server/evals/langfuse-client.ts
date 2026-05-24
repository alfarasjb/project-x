import { LangfuseClient } from "@langfuse/client"
import { env } from "@server/env"

/**
 * Lazily-constructed Langfuse SDK client for eval runs.
 *
 * Separate from the OTel tracing bootstrap (`server/observability/tracing.ts`)
 * which only wires the span processor — the experiment / dataset / score
 * APIs need the typed SDK client, which we build on demand and reuse.
 *
 * Throws if keys are missing because evals are an opt-in workflow: the
 * caller (the CLI runner) is the right place to surface a clear error.
 */
let cached: LangfuseClient | undefined

export function getLangfuseClient(): LangfuseClient {
	if (cached) return cached
	if (!env.LANGFUSE_PUBLIC_KEY || !env.LANGFUSE_SECRET_KEY) {
		throw new Error(
			"Langfuse keys missing — set LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY in .env to run evals."
		)
	}
	cached = new LangfuseClient({
		publicKey: env.LANGFUSE_PUBLIC_KEY,
		secretKey: env.LANGFUSE_SECRET_KEY,
		baseUrl: env.LANGFUSE_BASE_URL
	})
	return cached
}
