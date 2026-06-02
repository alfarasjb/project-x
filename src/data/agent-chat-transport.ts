import { apiRoutes } from "@shared/api-routes"
import { ChatEventSchema } from "@shared/schemas/chat"
import { buildApiError } from "@/lib/api"
import type { ChatEvent, ChatTransport } from "@/components/graph/agent/types"

/**
 * Real QA-agent transport — the production implementation of the `ChatTransport`
 * seam ARG-36 left for ARG-37. POSTs the user's turn to the project's agent
 * endpoint and parses the Server-Sent Events response into the same
 * `AsyncIterable<ChatEvent>` the mock produced, so the store + UI are untouched.
 *
 * Each `data:` frame is validated through `ChatEventSchema` (Zod at the boundary,
 * mirroring `apiGet`/`apiPost`) before it reaches the reducer — a malformed event
 * throws, which the store's `runTurn` catches to re-enable the composer.
 */
export function createAgentChatTransport(projectId: string): ChatTransport {
	return async function* (userText, signal) {
		const res = await fetch(apiRoutes.projectAgent(projectId), {
			method: "POST",
			headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
			credentials: "include",
			body: JSON.stringify({ message: userText }),
			signal
		})
		// Errors are returned as JSON before the stream opens (auth / no-graph /
		// missing key), so a non-OK response still carries the standard `{ error }`.
		if (!res.ok || !res.body) {
			throw await buildApiError(res)
		}

		const reader = res.body.getReader()
		const decoder = new TextDecoder()
		let buffer = ""
		try {
			for (;;) {
				const { done, value } = await reader.read()
				if (done) break
				buffer += decoder.decode(value, { stream: true })
				// SSE frames are separated by a blank line.
				let boundary = buffer.indexOf("\n\n")
				while (boundary !== -1) {
					const frame = buffer.slice(0, boundary)
					buffer = buffer.slice(boundary + 2)
					const event = parseFrame(frame)
					if (event) yield event
					boundary = buffer.indexOf("\n\n")
				}
			}
		} finally {
			reader.releaseLock()
		}
	}
}

/** Extract and validate the `ChatEvent` from one SSE frame, or null for a non-data frame. */
function parseFrame(frame: string): ChatEvent | null {
	const dataLine = frame.split("\n").find((line) => line.startsWith("data:"))
	if (!dataLine) return null
	const payload = dataLine.slice("data:".length).trim()
	if (!payload) return null
	const json: unknown = JSON.parse(payload)
	return ChatEventSchema.parse(json)
}
