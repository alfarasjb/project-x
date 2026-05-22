import type { FastifyInstance } from "fastify"
import { EMPTY_GRAPH } from "@shared/schemas/graph"
import { ensureDefaultProject } from "@server/domain/tenancy"
import { crawlProject, getProjectGraph } from "@server/domain/graph"

/**
 * Graph routes.
 *
 * `GET /api/graph` reads the *stored* actual graph — it never re-parses, so a
 * page refresh is a cheap DB read. The graph changes only when the user crawls.
 * `POST /api/graph/crawl` re-parses the repo, persists the result, and returns
 * the fresh graph.
 */
export async function graphRoutes(app: FastifyInstance): Promise<void> {
	app.get("/api/graph", async () => {
		const project = await ensureDefaultProject()
		const graph = await getProjectGraph(project.id)
		return graph?.actual ?? EMPTY_GRAPH
	})

	app.post("/api/graph/crawl", async () => {
		const project = await ensureDefaultProject()
		return crawlProject(project)
	})
}
