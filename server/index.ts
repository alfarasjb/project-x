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

const PORT = env.PORT

const app = Fastify({ logger: { level: "info" } })

await app.register(cors, { origin: env.APP_URL, credentials: true })

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
