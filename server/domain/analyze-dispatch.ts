import { tasks } from "@trigger.dev/sdk"
import type { Project } from "@shared/schemas/project"
import { getGithubAccessToken } from "@server/domain/github"
import { AppError } from "@server/utils/errors"
import type { analyzeProjectTask } from "@server/trigger/analyze-project"

/**
 * Dispatcher between the Fastify request handler and the Trigger.dev analyze
 * task. Pre-checks the prerequisites here (GH connection, repoUrl present)
 * so the user gets an immediate 4xx instead of a doomed task run that
 * fails minutes later.
 *
 * Mirrors `crawl-dispatch`: payload is `{ projectId, userId, force }` only,
 * no secrets. The task reads the GitHub token from the `account` table at
 * runtime so nothing sensitive sits in Trigger's stored run history.
 *
 * Crawl-vs-analyze are intentionally separate operations — analyze never
 * implies a crawl, and dispatching this task assumes the graph already
 * exists on the project. The task itself throws a 409 if it doesn't.
 */
export async function dispatchAnalyzeProject(
	project: Project,
	userId: string,
	options: { force: boolean }
): Promise<{ runId: string }> {
	if (!project.repoUrl) {
		throw new AppError(500, "dispatchAnalyzeProject called for a non-GitHub project")
	}
	await getGithubAccessToken(userId)
	const handle = await tasks.trigger<typeof analyzeProjectTask>("analyze-project", {
		projectId: project.id,
		userId,
		force: options.force
	})
	return { runId: handle.id }
}
