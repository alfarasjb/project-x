import { NodeSDK } from "@opentelemetry/sdk-node"
import { LangfuseSpanProcessor } from "@langfuse/otel"
import { env } from "@server/env"

/**
 * OpenTelemetry bootstrap for Langfuse.
 *
 * Imported for its side effect — must be the FIRST import in `server/index.ts`
 * so the global TracerProvider is registered before any `observe()` call runs.
 *
 * Telemetry is opt-in: with both `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY`
 * set, every `observe()`-wrapped LLM call ships to Langfuse Cloud. Missing
 * either key = the SDK is never started, `observe()` silently no-ops, the app
 * behaves identically.
 *
 * The default `LangfuseSpanProcessor` filter keeps the noise down: only spans
 * created via `@langfuse/tracing` (ours) plus spans from known LLM
 * instrumentors are exported. HTTP / DB instrumentation is intentionally NOT
 * registered here — we want LLM traces, not request traces.
 */

let started = false

export function startTracing(): void {
	if (started) return
	if (!env.LANGFUSE_PUBLIC_KEY || !env.LANGFUSE_SECRET_KEY) return

	const sdk = new NodeSDK({
		spanProcessors: [
			new LangfuseSpanProcessor({
				publicKey: env.LANGFUSE_PUBLIC_KEY,
				secretKey: env.LANGFUSE_SECRET_KEY,
				baseUrl: env.LANGFUSE_BASE_URL,
				environment: env.LANGFUSE_ENVIRONMENT
			})
		]
	})
	sdk.start()
	started = true

	// Flush on shutdown so in-flight spans aren't lost if the server exits
	// between Langfuse's batch flushes (default 5s).
	const shutdown = async (): Promise<void> => {
		try {
			await sdk.shutdown()
		} catch {
			// Best-effort — we're shutting down anyway.
		}
	}
	process.once("SIGTERM", shutdown)
	process.once("SIGINT", shutdown)
	process.once("beforeExit", shutdown)
}

startTracing()
