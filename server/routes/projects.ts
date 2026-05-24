import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { apiRoutePatterns } from "@shared/api-routes"
import { CreateProjectSchema, RenameProjectSchema } from "@shared/schemas/project"
import { AppError } from "@server/utils/errors"
import { requireAuth } from "@server/auth-context"
import {
	archiveProject,
	createProject,
	getProjectForOrg,
	listProjects,
	renameProject,
	unarchiveProject
} from "@server/domain/project"

/**
 * Project routes — CRUD for the repos the app tracks, scoped to the active
 * org on every call. Cross-org access returns 404 (not 403) so ids don't
 * leak across tenants. Removal is a soft archive (`POST /:id/archive`); the
 * row and its crawled graph are kept and can be restored via `/:id/unarchive`.
 */
export async function projectRoutes(app: FastifyInstance): Promise<void> {
	app.get<{ Querystring: { archived?: string } }>(
		apiRoutePatterns.projectsList,
		async (request) => {
			const { organizationId } = await requireAuth(request)
			return listProjects({ organizationId, archived: request.query.archived === "true" })
		}
	)

	app.get<{ Params: { id: string } }>(apiRoutePatterns.project, async (request) => {
		const { organizationId } = await requireAuth(request)
		const project = await getProjectForOrg(request.params.id, organizationId)
		if (!project) throw new AppError(404, `Project not found: ${request.params.id}`)
		return project
	})

	app.post(apiRoutePatterns.projectsList, async (request) => {
		const { organizationId } = await requireAuth(request)
		const parsed = CreateProjectSchema.safeParse(request.body)
		if (!parsed.success) {
			throw new AppError(400, z.prettifyError(parsed.error))
		}
		return createProject(parsed.data, organizationId)
	})

	app.post<{ Params: { id: string } }>(apiRoutePatterns.projectArchive, async (request) => {
		const { organizationId } = await requireAuth(request)
		const project = await archiveProject(request.params.id, organizationId)
		if (!project) throw new AppError(404, `Project not found: ${request.params.id}`)
		return project
	})

	app.post<{ Params: { id: string } }>(apiRoutePatterns.projectUnarchive, async (request) => {
		const { organizationId } = await requireAuth(request)
		const project = await unarchiveProject(request.params.id, organizationId)
		if (!project) throw new AppError(404, `Project not found: ${request.params.id}`)
		return project
	})

	app.post<{ Params: { id: string } }>(apiRoutePatterns.projectRename, async (request) => {
		const { organizationId } = await requireAuth(request)
		const parsed = RenameProjectSchema.safeParse(request.body)
		if (!parsed.success) {
			throw new AppError(400, z.prettifyError(parsed.error))
		}
		const project = await renameProject(request.params.id, organizationId, parsed.data.name)
		if (!project) throw new AppError(404, `Project not found: ${request.params.id}`)
		return project
	})
}
