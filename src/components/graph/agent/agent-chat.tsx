import { useAgentChat } from "@/hooks/use-agent-chat"
import { MessageList } from "./message-list"
import { Composer } from "./composer"

/**
 * QA Agent tab body — the demoable chat shell. Everything comes from the
 * `useAgentChat` seam (mock-backed today, ARG-37's server loop tomorrow); this
 * component just composes the scrolling stream above the composer.
 */
export function AgentChat() {
	const { messages, status, sendMessage } = useAgentChat()

	return (
		<div className="flex h-full min-h-0 flex-col">
			<MessageList messages={messages} status={status} />
			<Composer status={status} onSend={sendMessage} />
		</div>
	)
}
