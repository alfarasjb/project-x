import { randomUUID } from "node:crypto"
import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { apiRoutePatterns } from "@shared/api-routes"
import { ChatEventSchema, type ChatEvent } from "@shared/schemas/chat"
import { AppError } from "@server/utils/errors"
import { requireAuth } from "@server/auth-context"
import { getProjectGraph } from "@server/domain/graph"
import { getProjectForOrg } from "@server/domain/project"
import {
	MissingProviderKeyError,
	getStreamingAgentRuntime,
	type AnthropicAgentRuntime
} from "@server/llm/fallback/factory"
import { runQaAgent } from "@server/agent/qa-agent-loop"

/**
 * QA Agent route — `POST /api/projects/:id/agent`. Streams the hand-wired agent
 * loop's `ChatEvent`s back as Server-Sent Events. The ARG-36 chat shell consumes
 * the exact same event union, so the frontend swap is one transport line.
 *
 * Auth + project lookup + graph load + provider-key resolution all run BEFORE the
 * stream is opened, so their thrown `AppError`s still flow through the central
 * error handler as clean JSON 4xx/5xx (the composer recovers). Once the stream is
 * hijacked, the headers are flushed — so an error mid-loop can't set a status; it
 * is framed in-band as a stream-closing `message-end` instead (per the ARG-37
 * decision to reuse the existing event union, no transport-level error variant).
 */

const AgentRequestSchema = z.object({
	message: z.string().min(1).max(4000)
})

/**
 * Appended to the assistant turn when the stream fails after headers are flushed.
 * The real error is logged server-side; the user just needs to know the answer is
 * incomplete rather than seeing a silently truncated bubble presented as done.
 */
const STREAM_ERROR_NOTICE =
	"\n\nThe agent ran into an error and couldn't finish responding. Please try again."

export async function agentRoutes(app: FastifyInstance): Promise<void> {
	app.post<{ Params: { id: string }; Body: unknown }>(
		apiRoutePatterns.projectAgent,
		async (request, reply) => {
			const { organizationId } = await requireAuth(request)
			const project = await getProjectForOrg(request.params.id, organizationId)
			if (!project) throw new AppError(404, `Project not found: ${request.params.id}`)

			const { message } = AgentRequestSchema.parse(request.body)

			const stored = await getProjectGraph(project.id)
			const graph = stored?.actual
			if (!graph || graph.nodes.length === 0) {
				throw new AppError(409, `Project "${project.slug}" has no graph — crawl it first.`)
			}

			const runtime = resolveRuntime()

			// Past this point the response is a stream — frame failures in-band, not as HTTP status.
			const messageId = randomUUID()
			reply.hijack()
			const raw = reply.raw
			raw.writeHead(200, {
				"Content-Type": "text/event-stream",
				"Cache-Control": "no-cache, no-transform",
				Connection: "keep-alive",
				// Disable proxy buffering so events reach the browser incrementally.
				"X-Accel-Buffering": "no"
			})

			const send = (event: ChatEvent): void => {
				raw.write(`data: ${JSON.stringify(ChatEventSchema.parse(event))}\n\n`)
			}

			try {
				for await (const event of runQaAgent({
					messageId,
					runtime,
					projectId: project.id,
					projectName: project.name,
					graph,
					userMessage: message
				})) {
					send(event)
				}
			} catch (error) {
				request.log.error({ err: error }, "qa-agent stream failed")
				// Headers are already flushed, so we can't set an HTTP status. Surface
				// the failure in-band as a final assistant note, then end the turn — the
				// user sees an honest "it broke", not a silently truncated answer. The
				// reducer's message-end re-enables the composer.
				send({ type: "text-delta", messageId, delta: STREAM_ERROR_NOTICE })
				send({ type: "message-end", messageId })
			} finally {
				raw.end()
			}
		}
	)
}

/**
 * Resolve the streaming runtime, mapping a missing provider key to a clean 503
 * (a deployment-config problem, surfaced before the stream opens) rather than a
 * generic 500.
 */
function resolveRuntime(): AnthropicAgentRuntime {
	try {
		return getStreamingAgentRuntime("qa-agent")
	} catch (error) {
		if (error instanceof MissingProviderKeyError) {
			throw new AppError(
				503,
				`The QA agent is unavailable — ${error.envVar} is not set on the server.`,
				{ cause: error }
			)
		}
		throw error
	}
}
