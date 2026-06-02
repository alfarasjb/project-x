import { useCallback, useMemo } from "react"
import { createAgentChatTransport } from "@/data/agent-chat-transport"
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
 * The QA Agent chat seam. Wires the chat store to the real server transport,
 * scoped to one project. The store + UI are transport-agnostic — they only see
 * the `ChatEvent` stream — so this hook is the single place the wiring lives.
 */
export function useAgentChat(projectId: string): UseAgentChat {
	const messages = useAgentChatStore((state) => state.messages)
	const status = useAgentChatStore((state) => state.status)
	const runTurn = useAgentChatStore((state) => state.runTurn)
	const reset = useAgentChatStore((state) => state.reset)

	const transport = useMemo(() => createAgentChatTransport(projectId), [projectId])

	const sendMessage = useCallback(
		(text: string) => {
			void runTurn(transport, text)
		},
		[runTurn, transport]
	)

	return { messages, status, sendMessage, reset }
}
