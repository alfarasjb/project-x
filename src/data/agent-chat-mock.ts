import type { ChatTransport } from "@/components/graph/agent/types"

/**
 * Mock QA-agent transport — the current implementation of the `ChatTransport`
 * seam (`@/components/graph/agent/types`). It scripts one demo turn so the chat
 * UI is fully exercisable before the real server loop (ARG-37) exists: a
 * thinking beat, streamed text, a tool call that resolves, then a follow-up
 * that references the result.
 *
 * Awaited `delay()`s only — no standing timers — so the generator stays a pure
 * async sequence that the store consumes with `for await`. Swap this for the
 * real transport in `use-agent-chat` and nothing else changes.
 */

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/** Split into word-plus-trailing-space chunks so text streams a token at a time. */
const chunks = (text: string): string[] => text.match(/\S+\s*/g) ?? []

/** Awaited pauses (ms) that pace the scripted demo turn. */
const MOCK_DELAYS = {
	textDelta: 45,
	thinking: 550,
	toolRun: 650
} as const

export const mockChatTransport: ChatTransport = async function* (userText) {
	const messageId = crypto.randomUUID()
	const toolCallId = crypto.randomUUID()

	const opening = `Let me inspect the nodes related to "${userText.trim()}".`
	const followUp =
		" Found 8 service-layer nodes; the harness fans out to four of them. Ask about any one to drill in."

	// Thinking beat — the composer shows a shimmer until the first content lands.
	await delay(MOCK_DELAYS.thinking)
	yield { type: "message-start", messageId, role: "assistant" }

	for (const chunk of chunks(opening)) {
		await delay(MOCK_DELAYS.textDelta)
		yield { type: "text-delta", messageId, delta: chunk }
	}

	yield {
		type: "tool-call-start",
		messageId,
		toolCall: { id: toolCallId, name: "list_nodes", argsSummary: "layer: service" }
	}
	await delay(MOCK_DELAYS.toolRun)
	yield {
		type: "tool-call-end",
		messageId,
		toolCallId,
		status: "done",
		resultSummary: "8 nodes"
	}

	for (const chunk of chunks(followUp)) {
		await delay(MOCK_DELAYS.textDelta)
		yield { type: "text-delta", messageId, delta: chunk }
	}

	yield { type: "message-end", messageId }
}
