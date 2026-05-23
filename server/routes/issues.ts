import type { FastifyInstance } from "fastify"
import { AppError } from "@server/utils/errors"
import { requireAuth } from "@server/auth-context"
import { getProjectIssues } from "@server/domain/graph"
import { getProjectForOrg } from "@server/domain/project"

/**
 * Audit-issue routes, scoped to a project. The list is whatever the most
 * recent crawl wrote; clicking Crawl on the dashboard refreshes it. There
 * is no per-issue write endpoint — issues are derived, not user-edited.
 */
export async function issueRoutes(app: FastifyInstance): Promise<void> {
	app.get<{ Params: { id: string } }>("/api/projects/:id/issues", async (request) => {
		const { organizationId } = await requireAuth(request)
		const project = await getProjectForOrg(request.params.id, organizationId)
		if (!project) throw new AppError(404, `Project not found: ${request.params.id}`)
		return getProjectIssues(project.id)
	})
}
