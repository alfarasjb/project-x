import { logger, schemaTask } from "@trigger.dev/sdk"
import { z } from "zod"
import { crawlProjectFromPath } from "@server/domain/graph"
import { getProject } from "@server/domain/project"
import { withClonedRepo } from "@server/domain/with-cloned-repo"

/**
 * Crawl-from-GitHub task. Runs on a Trigger.dev worker container — the
 * Fastify dyno NEVER holds the clone or the AST. Memory + disk belong to a
 * per-task ephemeral machine and are reclaimed when the container exits.
 *
 * Body is intentionally thin: resolve the project, clone via the shared
 * `withClonedRepo` HOF (which owns clone + extract + cleanup), hand the
 * extracted path to `crawlProjectFromPath`. Same persistence + audit
 * logic as the local-rootPath path — only the source-of-files differs.
 */
export const crawlGithubRepoTask = schemaTask({
	id: "crawl-github-repo",
	schema: z.object({
		projectId: z.uuid(),
		userId: z.string().min(1)
	}),
	run: async ({ projectId, userId }) => {
		const project = await getProject(projectId)
		if (!project) throw new Error(`Project not found: ${projectId}`)
		return withClonedRepo(project, userId, async (sourcePath) => {
			logger.info("running parse+audit", { projectId, sourcePath })
			const graph = await crawlProjectFromPath(project, sourcePath)
			logger.info("crawl complete", {
				projectId,
				nodes: graph.nodes.length,
				edges: graph.edges.length,
				files: graph.nodes.filter((n) => n.kind === "file").length,
				modules: graph.nodes.filter((n) => n.kind === "module").length
			})
			return {
				ok: true as const,
				nodes: graph.nodes.length,
				edges: graph.edges.length
			}
		})
	}
})
