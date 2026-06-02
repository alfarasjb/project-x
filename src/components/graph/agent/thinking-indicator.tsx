/**
 * Shown after a turn is sent, before the assistant's first token lands — the
 * gap the real loop spends building context and waiting on the model.
 */
export function ThinkingIndicator() {
	return (
		<div className="text-muted-foreground flex items-center gap-1.5 self-start px-1 text-sm">
			<span className="bg-muted-foreground size-1.5 animate-pulse rounded-full" />
			<span className="bg-muted-foreground size-1.5 animate-pulse rounded-full [animation-delay:150ms]" />
			<span className="bg-muted-foreground size-1.5 animate-pulse rounded-full [animation-delay:300ms]" />
			<span className="ml-1">Thinking…</span>
		</div>
	)
}
