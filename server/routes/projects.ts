import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { CreateProjectSchema } from "@shared/schemas/project"
import { AppError } from "@server/utils/errors"
import {
	archiveProject,
	createProject,
	getProject,
	listProjects,
	unarchiveProject
} from "@server/domain/project"

/**
 * Project routes — CRUD for the repos the app tracks. Removal is a soft
 * archive (`POST /:id/archive`); the row and its crawled graph are kept and
 * can be restored via `/:id/unarchive`.
 */
export async function projectRoutes(app: FastifyInstance): Promise<void> {
	app.get<{ Querystring: { archived?: string } }>("/api/projects", async (request) => {
		return listProjects({ archived: request.query.archived === "true" })
	})

	app.get<{ Params: { id: string } }>("/api/projects/:id", async (request) => {
		const project = await getProject(request.params.id)
		if (!project) throw new AppError(404, `Project not found: ${request.params.id}`)
		return project
	})

	app.post("/api/projects", async (request) => {
		const parsed = CreateProjectSchema.safeParse(request.body)
		if (!parsed.success) {
			throw new AppError(400, z.prettifyError(parsed.error))
		}
		return createProject(parsed.data)
	})

	app.post<{ Params: { id: string } }>("/api/projects/:id/archive", async (request) => {
		const project = await archiveProject(request.params.id)
		if (!project) throw new AppError(404, `Project not found: ${request.params.id}`)
		return project
	})

	app.post<{ Params: { id: string } }>("/api/projects/:id/unarchive", async (request) => {
		const project = await unarchiveProject(request.params.id)
		if (!project) throw new AppError(404, `Project not found: ${request.params.id}`)
		return project
	})
}
