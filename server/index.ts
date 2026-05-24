// Tracing first — registers the OpenTelemetry TracerProvider before any
// `observe()` call from downstream imports runs. No-op when Langfuse env
// vars are unset.
import "@server/observability/tracing"
import { env } from "@server/env"
import Fastify from "fastify"
import cors from "@fastify/cors"
import { authRoutes } from "@server/routes/auth"
import { projectRoutes } from "@server/routes/projects"
import { graphRoutes } from "@server/routes/graph"
import { issueRoutes } from "@server/routes/issues"
import { AppError } from "@server/utils/errors"

const PORT = env.PORT

const app = Fastify({ logger: { level: "info" } })

await app.register(cors, { origin: env.APP_URL, credentials: true })

/**
 * Centralized error handler — every uncaught error funnels through here so the
 * wire format is consistent: `{ error: <message>, details?: <unknown> }` with
 * the appropriate HTTP status. Two cases:
 *
 *   - `AppError` — expected domain failures (400/404/409/etc). The message is
 *     user-facing and goes straight back to the client.
 *   - Anything else — unexpected. Log the full error server-side, return a
 *     generic "Something went wrong" to the client so we don't leak stacks
 *     or sensitive details.
 *
 * Fastify's default error formatter would emit `{ statusCode, error: "Bad
 * Request", message }` which is redundant and includes the HTTP status text
 * (we already have the status header). Our shape is just the user-relevant
 * bits.
 */
app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
	if (error instanceof AppError) {
		reply.status(error.statusCode).send({ error: error.message })
		return
	}
	// Fastify's validation errors also carry a statusCode but aren't AppError.
	const status = error.statusCode
	if (typeof status === "number" && status >= 400 && status < 500) {
		reply.status(status).send({ error: error.message })
		return
	}
	request.log.error({ err: error }, "unhandled error")
	reply.status(500).send({ error: "Something went wrong on our end. Please try again." })
})

app.get("/api/health", () => ({
	status: "ok" as const,
	mcp: { status: "stub" as const, transport: "stdio" as const },
	uptime: Math.round(process.uptime())
}))

// Auth routes register FIRST — domain routes use requireAuth() against the
// session better-auth populates, so the handler must be mounted before they run.
await app.register(authRoutes)
await app.register(projectRoutes)
await app.register(graphRoutes)
await app.register(issueRoutes)

try {
	await app.listen({ port: PORT, host: "0.0.0.0" })
	app.log.info(`project-x server listening on http://localhost:${PORT}`)
} catch (err) {
	app.log.error(err)
	process.exit(1)
}
