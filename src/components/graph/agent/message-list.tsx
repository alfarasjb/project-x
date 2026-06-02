import { useEffect, useRef } from "react"
import type { ChatMessage } from "./types"
import type { ChatStatus } from "@/stores/agent-chat-store"
import { MessageBubble } from "./message-bubble"
import { ThinkingIndicator } from "./thinking-indicator"

/**
 * Scrolling message stream, newest at the bottom. Auto-scrolls to the bottom as
 * content streams in. Empty until the first turn — a short prompt stands in.
 */
export function MessageList({ messages, status }: { messages: ChatMessage[]; status: ChatStatus }) {
	const bottomRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ block: "end" })
	}, [messages, status])

	if (messages.length === 0) {
		return (
			<div className="text-muted-foreground flex flex-1 items-center justify-center p-6 text-center text-sm">
				Ask about this graph…
			</div>
		)
	}

	return (
		<div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
			{messages.map((message) => (
				<MessageBubble key={message.id} message={message} />
			))}
			{status === "thinking" && <ThinkingIndicator />}
			<div ref={bottomRef} />
		</div>
	)
}
