import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { EMPTY_GRAPH } from "@shared/schemas/graph"
import { AppError } from "@server/utils/errors"
import { requireAuth } from "@server/auth-context"
import { analyzeProject, crawlProject, getProjectGraph } from "@server/domain/graph"
import { getProjectForOrg } from "@server/domain/project"
import { MissingProviderKeyError } from "@server/llm/fallback/factory"

/**
 * Body of `POST /api/projects/:id/analyze`. `force: true` bypasses the
 * "skip files whose hash matches" dedup and re-classifies every node —
 * use sparingly, it's the full LLM bill.
 */
const AnalyzeBodySchema = z
	.object({
		force: z.boolean().optional()
	})
	.optional()

/**
 * Graph routes, scoped to a project that belongs to the active org.
 *
 * `GET /api/projects/:id/graph` reads the *stored* actual graph — it never
 * re-parses, so a page refresh is a cheap DB read. `POST .../graph/crawl`
 * re-parses the project's repo and persists the result. `POST .../analyze`
 * is the separate AI enrichment step (Claude classifies + describes each
 * node); it's user-triggered because it costs money.
 */
export async function graphRoutes(app: FastifyInstance): Promise<void> {
	app.get<{ Params: { id: string } }>("/api/projects/:id/graph", async (request) => {
		const { organizationId } = await requireAuth(request)
		const project = await getProjectForOrg(request.params.id, organizationId)
		if (!project) throw new AppError(404, `Project not found: ${request.params.id}`)
		const graph = await getProjectGraph(project.id)
		return graph?.actual ?? EMPTY_GRAPH
	})

	app.post<{ Params: { id: string } }>("/api/projects/:id/graph/crawl", async (request) => {
		const { organizationId } = await requireAuth(request)
		const project = await getProjectForOrg(request.params.id, organizationId)
		if (!project) throw new AppError(404, `Project not found: ${request.params.id}`)
		return crawlProject(project)
	})

	app.post<{ Params: { id: string }; Body: unknown }>(
		"/api/projects/:id/analyze",
		async (request) => {
			const { organizationId } = await requireAuth(request)
			const project = await getProjectForOrg(request.params.id, organizationId)
			if (!project) throw new AppError(404, `Project not found: ${request.params.id}`)
			const body = AnalyzeBodySchema.parse(request.body ?? {})
			try {
				const { graph, analyzed, skipped, failed } = await analyzeProject(project, {
					force: body?.force ?? false
				})
				return { graph, analyzed, skipped, failed }
			} catch (error) {
				if (error instanceof MissingProviderKeyError) {
					throw new AppError(
						503,
						`Analyze is unavailable — ${error.envVar} is not set on the server.`,
						error
					)
				}
				throw error
			}
		}
	)
}
