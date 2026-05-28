import type { Project } from "@shared/schemas/project"
import type { AnalyzeResponse, CrawlResponse } from "@shared/schemas/crawl"
import { crawlProjectFromPath, analyzeProjectFromPath } from "@server/domain/graph"
import { dispatchCrawlGithub } from "@server/domain/crawl-dispatch"
import { dispatchAnalyzeProject } from "@server/domain/analyze-dispatch"
import { AppError } from "@server/utils/errors"

/**
 * Crawl/analyze orchestration entry points. These decide local-vs-GitHub and
 * either run the inline pipeline (`*FromPath` in `graph/index.ts`) or dispatch
 * a Trigger.dev task.
 *
 * Kept separate from `graph/index.ts` deliberately: the dispatchers transitively
 * reference their Trigger tasks, and those tasks call the `*FromPath` inner
 * loops back. With the entry points living in `graph/index.ts`, that closed a
 * `graph → dispatch → trigger → graph` import cycle. Splitting the
 * dispatch-aware entry points out leaves `graph/index.ts` dispatch-free, so the
 * tasks can import the inner loops without forming a loop.
 */

/**
 * Crawl a project — entry point for both code paths. Two modes:
 *
 *   - Local (`rootPath`) — Fastify runs the parse + audit inline against the
 *     local filesystem and returns the fresh graph in the same request.
 *   - GitHub (`repoUrl`) — dispatch a Trigger.dev task that clones, parses,
 *     and persists on a worker. Returns a runId immediately; the UI polls
 *     `GET /api/crawl-runs/:runId` to discover completion, then refetches
 *     the graph from the DB.
 *
 * One of `rootPath` / `repoUrl` is always set on a project (DB constraint
 * is loose, but `createProject` enforces it). Neither = real bug, 409.
 */
export async function crawlProject(project: Project, userId: string): Promise<CrawlResponse> {
	if (project.repoUrl) {
		const { runId } = await dispatchCrawlGithub(project, userId)
		return { kind: "queued", runId }
	}
	if (!project.rootPath) {
		throw new AppError(
			409,
			`Project "${project.slug}" has neither a local path nor a GitHub URL — can't crawl.`
		)
	}
	const graph = await crawlProjectFromPath(project, project.rootPath)
	return { kind: "completed", graph }
}

/**
 * Run the AI enrichment pass over a project's stored graph — entry point
 * for both code paths.
 *
 *   - Local (`rootPath`) — Fastify runs the LLM pass inline against the
 *     working tree and returns the result in the same request.
 *   - GitHub (`repoUrl`) — dispatch a Trigger.dev task that clones, runs
 *     the same pass on a worker, and persists. Returns a runId
 *     immediately; the UI polls `GET /api/task-runs/:runId`.
 *
 * Analyze is a distinct user action from crawl: it assumes a graph
 * already exists (throws 409 otherwise) and only refreshes the LLM-
 * derived enrichment + the similarity audit. Crawl is not implied.
 */
export async function analyzeProject(
	project: Project,
	userId: string,
	options?: { force?: boolean }
): Promise<AnalyzeResponse> {
	if (project.repoUrl) {
		const { runId } = await dispatchAnalyzeProject(project, userId, {
			force: options?.force ?? false
		})
		return { kind: "queued", runId }
	}
	if (!project.rootPath) {
		throw new AppError(
			409,
			`Project "${project.slug}" has neither a local path nor a GitHub URL — can't analyze.`
		)
	}
	const result = await analyzeProjectFromPath(project, project.rootPath, options)
	return { kind: "completed", result }
}
