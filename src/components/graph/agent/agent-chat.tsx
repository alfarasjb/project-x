import { useAgentChat } from "@/hooks/use-agent-chat"
import { MessageList } from "./message-list"
import { Composer } from "./composer"

/**
 * QA Agent tab body — the chat shell. Everything comes from the `useAgentChat`
 * seam (the real server loop, scoped to this project); this component just
 * composes the scrolling stream above the composer.
 */
export function AgentChat({ projectId }: { projectId: string }) {
	const { messages, status, sendMessage } = useAgentChat(projectId)

	return (
		<div className="flex h-full min-h-0 flex-col">
			<MessageList messages={messages} status={status} />
			<Composer status={status} onSend={sendMessage} />
		</div>
	)
}
