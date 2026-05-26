import { tasks } from "@trigger.dev/sdk"
import type { Project } from "@shared/schemas/project"
import { getGithubAccessToken } from "@server/domain/github"
import { AppError } from "@server/utils/errors"
import type { crawlGithubRepoTask } from "@server/trigger/crawl-github"

/**
 * Dispatcher between the Fastify request handler and the Trigger.dev crawl
 * task. Pre-checks the prerequisites here (GH connection, repoUrl present)
 * so the user gets an immediate, actionable 4xx instead of a doomed task
 * run that fails minutes later.
 *
 * The task only receives `{ projectId, userId }` — no secrets cross the
 * wire to Trigger. The task itself reads the GitHub token from the
 * `account` table at runtime.
 *
 * `tasks.trigger` (not `triggerAndWait`) — the route returns the runId
 * immediately, the UI polls `GET /api/crawl-runs/:runId`. Fastify never
 * blocks on the crawl duration.
 */
export async function dispatchCrawlGithub(
	project: Project,
	userId: string
): Promise<{ runId: string }> {
	if (!project.repoUrl) {
		// Caller's responsibility, but defensive: this function is only meaningful for GH projects.
		throw new AppError(500, "dispatchCrawlGithub called for a non-GitHub project")
	}
	// Pre-check the GH connection so the user can fix it before we burn a
	// task run. Throws 409 with an actionable message if not connected.
	await getGithubAccessToken(userId)

	const handle = await tasks.trigger<typeof crawlGithubRepoTask>("crawl-github-repo", {
		projectId: project.id,
		userId
	})
	return { runId: handle.id }
}
