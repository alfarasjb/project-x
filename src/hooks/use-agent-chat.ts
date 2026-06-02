import { useCallback } from "react"
import { mockChatTransport } from "@/data/agent-chat-mock"
import { useAgentChatStore, type ChatStatus } from "@/stores/agent-chat-store"
import type { ChatMessage } from "@/components/graph/agent/types"

export interface UseAgentChat {
	messages: ChatMessage[]
	status: ChatStatus
	/** Send a user turn. No-op while a turn is in flight (`status !== "idle"`). */
	sendMessage: (text: string) => void
	reset: () => void
}

/**
 * The QA Agent chat seam. Wires the chat store to a `ChatTransport`; today that
 * is the mock. When ARG-37's server loop lands, this hook is the single place
 * the swap happens — replace `mockChatTransport` with the real transport (or
 * make it injectable) and the store + UI are untouched.
 */
export function useAgentChat(): UseAgentChat {
	const messages = useAgentChatStore((state) => state.messages)
	const status = useAgentChatStore((state) => state.status)
	const runTurn = useAgentChatStore((state) => state.runTurn)
	const reset = useAgentChatStore((state) => state.reset)

	const sendMessage = useCallback(
		(text: string) => {
			void runTurn(mockChatTransport, text)
		},
		[runTurn]
	)

	return { messages, status, sendMessage, reset }
}
