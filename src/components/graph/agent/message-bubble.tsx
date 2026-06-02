import { cva } from "class-variance-authority"
import type { ChatMessage } from "./types"
import { cn } from "@/lib/utils"
import { ToolCallCard } from "./tool-call-card"

/**
 * One message in the stream. User turns are a filled bubble on the right;
 * assistant turns are plain text on the left with their tool calls rendered as
 * cards below. A blinking caret trails an assistant turn while it streams.
 */
const messageBubbleVariants = cva(
	"w-fit max-w-[85%] rounded-lg text-sm leading-snug break-words whitespace-pre-wrap",
	{
		variants: {
			role: {
				user: "bg-primary text-primary-foreground self-end px-3 py-2",
				assistant: "text-foreground self-start"
			}
		},
		defaultVariants: {
			role: "assistant"
		}
	}
)

export function MessageBubble({ message }: { message: ChatMessage }) {
	const showCaret = message.streaming && message.role === "assistant"
	const hasText = message.text.length > 0

	return (
		<div className="flex flex-col gap-1.5">
			{(hasText || showCaret) && (
				<div className={cn(messageBubbleVariants({ role: message.role }))}>
					{message.text}
					{showCaret && <span className="agent-caret" aria-hidden="true" />}
				</div>
			)}
			{message.toolCalls.length > 0 && (
				<div className="flex flex-col gap-1.5 self-start">
					{message.toolCalls.map((toolCall) => (
						<ToolCallCard key={toolCall.id} toolCall={toolCall} />
					))}
				</div>
			)}
		</div>
	)
}
