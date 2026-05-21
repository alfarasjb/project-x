import type { FastifyInstance } from "fastify"
import { parseProject } from "../parser/index.js"

/**
 * Graph routes. For now: parse the repo the server runs in and return the
 * graph. Later this becomes project-scoped and reads from Postgres.
 */
export async function graphRoutes(app: FastifyInstance): Promise<void> {
	app.get("/api/graph", async () => {
		return parseProject(process.cwd())
	})
}
