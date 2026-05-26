import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { apiRoutePatterns } from "@shared/api-routes"
import { AppError } from "@server/utils/errors"
import { requireAuth } from "@server/auth-context"
import { disconnectGithub, getGithubStatus, listUserRepos } from "@server/domain/github"

/**
 * Integration routes — per-user external-service connections. GitHub is the
 * only one today; future integrations (GitLab, etc.) mount alongside.
 *
 * Connect/disconnect themselves go through better-auth's `/api/auth/*` —
 * these endpoints are just for reading status and proxying authenticated
 * GitHub API calls (so the client never sees the OAuth token).
 */
export async function integrationRoutes(app: FastifyInstance): Promise<void> {
	app.get(apiRoutePatterns.integrationGithub, async (request) => {
		const { userId } = await requireAuth(request)
		return getGithubStatus(userId)
	})

	/**
	 * Disconnect = revoke the grant on GitHub's side AND drop the local
	 * account row. Better-auth's built-in `unlinkAccount` only does the
	 * latter, which leaves GitHub's app authorization in place and prevents
	 * scope escalation on the next Connect. We do both so the next link
	 * starts clean.
	 */
	app.post(apiRoutePatterns.integrationGithubDisconnect, async (request) => {
		const { userId } = await requireAuth(request)
		await disconnectGithub(userId)
		return { disconnected: true as const }
	})

	const reposQuery = z.object({
		page: z.coerce.number().int().positive().default(1),
		per_page: z.coerce.number().int().positive().max(100).default(30)
	})

	app.get<{ Querystring: { page?: string; per_page?: string } }>(
		apiRoutePatterns.integrationGithubRepos,
		async (request) => {
			const { userId } = await requireAuth(request)
			const parsed = reposQuery.safeParse(request.query)
			if (!parsed.success) {
				throw new AppError(400, z.prettifyError(parsed.error))
			}
			return listUserRepos(userId, { page: parsed.data.page, perPage: parsed.data.per_page })
		}
	)
}
