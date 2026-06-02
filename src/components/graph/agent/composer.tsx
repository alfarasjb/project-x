import { useState, type KeyboardEvent } from "react"
import { SendHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { ChatStatus } from "@/stores/agent-chat-store"

/**
 * Message input. Enter sends, Shift+Enter inserts a newline. Disabled while a
 * turn is in flight so the user can't stack turns against the single-flight
 * mock (and, later, the real loop).
 */
export function Composer({
	status,
	onSend
}: {
	status: ChatStatus
	onSend: (text: string) => void
}) {
	const [value, setValue] = useState("")
	const disabled = status !== "idle"

	const submit = () => {
		const text = value.trim()
		if (text.length === 0 || disabled) return
		onSend(text)
		setValue("")
	}

	const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault()
			submit()
		}
	}

	return (
		<div className="flex items-end gap-2 border-t p-2">
			<textarea
				value={value}
				onChange={(event) => setValue(event.target.value)}
				onKeyDown={onKeyDown}
				rows={1}
				placeholder="Ask about this graph…"
				className="bg-background placeholder:text-muted-foreground focus-visible:ring-ring max-h-32 min-h-9 flex-1 resize-none rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
			/>
			<Button
				type="button"
				size="icon"
				onClick={submit}
				disabled={disabled || value.trim().length === 0}
				title="Send"
			>
				<SendHorizontal />
			</Button>
		</div>
	)
}
