import { z } from "zod"
import { GraphSchema } from "@shared/schemas/graph"

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
 * Normalized run status returned by `GET /api/crawl-runs/:runId`. Trigger
 * exposes a longer-tail set of statuses (REATTEMPTING, FROZEN, CRASHED, …);
 * we collapse them into the three terminal categories the UI actually
 * branches on, plus an `error` field on `failed` for surfacing to the user.
 */
export const CrawlRunStatusSchema = z.object({
	runId: z.string().min(1),
	status: z.enum(["queued", "running", "completed", "failed"]),
	error: z.string().nullable()
})
export type CrawlRunStatus = z.infer<typeof CrawlRunStatusSchema>
