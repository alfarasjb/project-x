import { logger, schemaTask } from "@trigger.dev/sdk"
import { z } from "zod"
import { analyzeProjectFromPath } from "@server/domain/graph"
import { getProject } from "@server/domain/project"
import { withClonedRepo } from "@server/domain/with-cloned-repo"

/**
 * Analyze-project task. Runs the AI enrichment pass on a Trigger.dev
 * worker container — clone, classify+describe each node via Claude,
 * embed, similarity audit, persist. Crawl and analyze are intentionally
 * distinct: this task does NOT re-parse the repo's structure; it operates
 * on the already-crawled graph in the DB.
 *
 * Machine sizing matters here. Default is `small-1x` (0.5GB RAM) which
 * works for small repos but a monorepo with thousands of nodes wants
 * more headroom for the in-memory graph + LLM client + embedding batches.
 * Bumping to `medium-1x` (2GB).
 *
 * Cost ceiling: `maxDuration: 600` (10 min) and `retry.maxAttempts: 1`.
 * The 10-min ceiling kills truly runaway runs without retrying — analyze
 * isn't cheap to retry from scratch and a stuck pass is more likely to
 * stay stuck than recover. Project-sized repos (~100s of nodes) finish
 * well under this; a multi-thousand-node monorepo that legitimately needs
 * longer is a "click again" problem, not an "auto-retry" one.
 *
 * Body is thin: clone via the shared HOF, hand the path to the existing
 * inline analyze pipeline. Same code as local-rootPath analyze — only
 * the source-of-files differs.
 */
export const analyzeProjectTask = schemaTask({
	id: "analyze-project",
	machine: "medium-1x",
	maxDuration: 600,
	retry: { maxAttempts: 1 },
	schema: z.object({
		projectId: z.uuid(),
		userId: z.string().min(1),
		force: z.boolean()
	}),
	run: async ({ projectId, userId, force }) => {
		const project = await getProject(projectId)
		if (!project) throw new Error(`Project not found: ${projectId}`)
		return withClonedRepo(project, userId, async (sourcePath) => {
			logger.info("running analyze", { projectId, sourcePath, force })
			const result = await analyzeProjectFromPath(project, sourcePath, { force })
			logger.info("analyze complete", {
				projectId,
				analyzed: result.analyzed,
				skipped: result.skipped,
				failed: result.failed
			})
			return {
				ok: true as const,
				analyzed: result.analyzed,
				skipped: result.skipped,
				failed: result.failed
			}
		})
	}
})
