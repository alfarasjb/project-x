// Tracing first — registers the OpenTelemetry TracerProvider before any
// `observe()` call from downstream imports runs. No-op when Langfuse env
// vars are unset.
import "@server/observability/tracing"
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { env } from "@server/env"
import Fastify from "fastify"
import cors from "@fastify/cors"
import fastifyStatic from "@fastify/static"
import { authRoutes } from "@server/routes/auth"
import { projectRoutes } from "@server/routes/projects"
import { graphRoutes } from "@server/routes/graph"
import { issueRoutes } from "@server/routes/issues"
import { integrationRoutes } from "@server/routes/integrations"
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
await app.register(integrationRoutes)

/**
 * Single-service production mode: when a Vite build is present at `dist/web/`,
 * Fastify also serves the SPA. Detection is by file presence (not NODE_ENV) so
 * `pnpm build && pnpm start` works locally without env wrangling, and `pnpm dev`
 * naturally skips this branch — the Vite dev server handles the frontend there.
 *
 * The SPA fallback fires only for non-API GETs that didn't match a static file.
 * API 404s still respond as JSON; client-side routes (e.g. /projects/abc) get
 * index.html and let the router resolve them.
 */
const webDist = resolve(process.cwd(), "dist/web")
const webIndex = join(webDist, "index.html")
if (existsSync(webIndex)) {
	await app.register(fastifyStatic, { root: webDist, prefix: "/" })
	app.setNotFoundHandler((request, reply) => {
		if (request.method !== "GET" || request.url.startsWith("/api/")) {
			reply.status(404).send({ error: "Not Found" })
			return
		}
		reply.sendFile("index.html")
	})
	app.log.info(`serving web bundle from ${webDist}`)
}

try {
	await app.listen({ port: PORT, host: "0.0.0.0" })
	app.log.info(`project-x server listening on http://localhost:${PORT}`)
} catch (err) {
	app.log.error(err)
	process.exit(1)
}
