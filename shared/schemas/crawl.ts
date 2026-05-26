import { z } from "zod"
import { AnalyzeResultSchema, GraphSchema } from "@shared/schemas/graph"

/**
 * Crawl wire shapes — the response type from `POST /api/projects/:id/graph/crawl`
 * and the status from `GET /api/crawl-runs/:runId`.
 *
 * Two crawl modes coexist:
 *
 *   - **Local** (project has `rootPath`) — Fastify runs the parse inline and
 *     returns the resulting graph in the same request. Response is
 *     `{ kind: "completed", graph }`.
 *   - **GitHub** (project has `repoUrl`) — Fastify dispatches a Trigger.dev
 *     task that shallow-clones the repo on a worker, parses, and persists.
 *     The route returns immediately with `{ kind: "queued", runId }`; the
 *     UI polls the run status endpoint until the task lands.
 *
 * The discriminated union keeps both modes on one endpoint without leaking
 * mode-specific logic into the client beyond a single switch on `kind`.
 */
export const CrawlResponseSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("completed"), graph: GraphSchema }),
	z.object({ kind: z.literal("queued"), runId: z.string().min(1) })
])
export type CrawlResponse = z.infer<typeof CrawlResponseSchema>

/**
 * Response shape for `POST /api/projects/:id/analyze`. Mirrors
 * `CrawlResponse`: local projects analyze inline and return the full
 * result; GitHub projects dispatch a Trigger.dev task and return a runId
 * for the client to poll. Analyze is independent of crawl — the task only
 * needs an already-crawled graph; it does NOT re-run crawl.
 */
export const AnalyzeResponseSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("completed"), result: AnalyzeResultSchema }),
	z.object({ kind: z.literal("queued"), runId: z.string().min(1) })
])
export type AnalyzeResponse = z.infer<typeof AnalyzeResponseSchema>

/**
 * Normalized run status returned by `GET /api/task-runs/:runId`. Used by
 * every long-running task we poll (crawl, analyze, future handlers).
 * Trigger exposes a longer-tail set of statuses (REATTEMPTING, FROZEN,
 * CRASHED, …); we collapse them into the four states the UI branches on,
 * plus an `error` field on `failed` for surfacing to the user.
 */
export const TaskRunStatusSchema = z.object({
	runId: z.string().min(1),
	status: z.enum(["queued", "running", "completed", "failed"]),
	error: z.string().nullable()
})
export type TaskRunStatus = z.infer<typeof TaskRunStatusSchema>
