import type { FastifyInstance } from "fastify"
import { runs } from "@trigger.dev/sdk"
import { z } from "zod"
import { apiRoutePatterns } from "@shared/api-routes"
import type { CrawlRunStatus } from "@shared/schemas/crawl"
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
 *
 * Crawl can return two shapes — see `CrawlResponseSchema` in shared. Local
 * projects parse inline (`{ kind: "completed", graph }`); GitHub projects
 * dispatch a Trigger.dev task (`{ kind: "queued", runId }`) and the client
 * polls `GET /api/crawl-runs/:runId` until completion.
 */
export async function graphRoutes(app: FastifyInstance): Promise<void> {
	app.get<{ Params: { id: string } }>(apiRoutePatterns.projectGraph, async (request) => {
		const { organizationId } = await requireAuth(request)
		const project = await getProjectForOrg(request.params.id, organizationId)
		if (!project) throw new AppError(404, `Project not found: ${request.params.id}`)
		const graph = await getProjectGraph(project.id)
		return graph?.actual ?? EMPTY_GRAPH
	})

	app.post<{ Params: { id: string } }>(apiRoutePatterns.projectCrawl, async (request) => {
		const { organizationId, userId } = await requireAuth(request)
		const project = await getProjectForOrg(request.params.id, organizationId)
		if (!project) throw new AppError(404, `Project not found: ${request.params.id}`)
		return crawlProject(project, userId)
	})

	/**
	 * Poll the status of a Trigger.dev crawl run. The route is auth-gated
	 * (same session shape) but does NOT check that the run belongs to the
	 * user's org — Trigger run ids are opaque random strings, treating them
	 * as bearer-shaped is fine for v1. Revisit if we ever need stricter
	 * tenancy for crawl runs.
	 */
	app.get<{ Params: { runId: string } }>(apiRoutePatterns.crawlRun, async (request) => {
		await requireAuth(request)
		const run = await runs.retrieve(request.params.runId)
		const status = normalizeCrawlRunStatus(run.status)
		const error = run.error ? extractErrorMessage(run.error) : null
		const body: CrawlRunStatus = { runId: run.id, status, error }
		return body
	})

	app.post<{ Params: { id: string }; Body: unknown }>(
		apiRoutePatterns.projectAnalyze,
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

/**
 * Collapse Trigger.dev's long-tail status enum into the four states the UI
 * branches on. The default falls through to `running` so unknown transient
 * states don't trip the failed branch — the polling loop will see the next
 * status soon anyway.
 */
function normalizeCrawlRunStatus(triggerStatus: string): CrawlRunStatus["status"] {
	switch (triggerStatus) {
		case "QUEUED":
		case "PENDING_VERSION":
		case "WAITING_FOR_DEPLOY":
		case "DELAYED":
			return "queued"
		case "COMPLETED":
			return "completed"
		case "CANCELED":
		case "FAILED":
		case "CRASHED":
		case "INTERRUPTED":
		case "SYSTEM_FAILURE":
		case "EXPIRED":
		case "TIMED_OUT":
			return "failed"
		default:
			// EXECUTING / REATTEMPTING / FROZEN / WAITING_TO_RESUME / etc.
			return "running"
	}
}

/**
 * Trigger.dev's `run.error` is typed loosely — sometimes a string, sometimes
 * an object with `message`. Pull the most useful single line for the UI.
 */
function extractErrorMessage(error: unknown): string {
	if (typeof error === "string") return error
	if (error && typeof error === "object" && "message" in error) {
		const message = (error as { message: unknown }).message
		if (typeof message === "string") return message
	}
	return "Crawl failed"
}
