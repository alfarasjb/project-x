import { env } from "@server/env"
import Fastify from "fastify"
import cors from "@fastify/cors"
import { projectRoutes } from "@server/routes/projects"
import { graphRoutes } from "@server/routes/graph"

const PORT = env.PORT

const app = Fastify({ logger: { level: "info" } })

await app.register(cors, { origin: "http://localhost:5173", credentials: true })

app.get("/api/health", () => ({
	status: "ok" as const,
	mcp: { status: "stub" as const, transport: "stdio" as const },
	uptime: Math.round(process.uptime())
}))

await app.register(projectRoutes)
await app.register(graphRoutes)

try {
	await app.listen({ port: PORT, host: "0.0.0.0" })
	app.log.info(`project-x server listening on http://localhost:${PORT}`)
} catch (err) {
	app.log.error(err)
	process.exit(1)
}
