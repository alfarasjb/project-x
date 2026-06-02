import { useCallback, useEffect, useMemo } from "react"
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

	// The store is module-global but scoped to one project at a time. Reset on
	// project change / unmount so the prior project's transcript is never shown
	// here, and any in-flight stream is aborted rather than leaked.
	useEffect(() => () => reset(), [projectId, reset])

	const sendMessage = useCallback(
		(text: string) => {
			void runTurn(transport, text)
		},
		[runTurn, transport]
	)

	return { messages, status, sendMessage, reset }
}
