/**
 * QA Agent chat — the typed seam between the UI and whatever produces messages.
 *
 * Today the producer is a hand-authored mock (`@/data/agent-chat-mock`). When
 * ARG-37 lands the real server loop (which depends on ARG-9's `server/tools/`),
 * it swaps the mock for a transport that streams the SAME `ChatEvent` shape —
 * the store's reducer and every component below it stay untouched.
 *
 * The event stream is deliberately transport-agnostic: a `ChatTransport` is
 * just `(userText) => AsyncIterable<ChatEvent>`, which an SSE / ReadableStream /
 * WebSocket source maps onto without reshaping this contract.
 *
 * Local on purpose — no `shared/schemas` Zod wire schema yet, because the
 * ARG-9/ARG-37 server contract doesn't exist. These types ARE the seam until
 * it does.
 */

/** Who authored a message. Tool activity hangs off an assistant turn, below. */
export type ChatRole = "user" | "assistant"

export type ToolCallStatus = "running" | "done" | "error"

/** A single tool invocation surfaced inside an assistant turn. */
export interface ToolCall {
	id: string
	name: string
	/** Pre-summarized, human-readable args (e.g. `layer: service`). */
	argsSummary: string
	status: ToolCallStatus
	/** Present once `status === "done"` — a short result summary. */
	resultSummary?: string
	/** Present once `status === "error"`. */
	error?: string
}

/** One rendered message. Assistant turns accumulate text + tool calls as events arrive. */
export interface ChatMessage {
	id: string
	role: ChatRole
	/** Accumulated text; grows as `text-delta` events arrive. */
	text: string
	/** Tool calls surfaced inside this turn, in arrival order. */
	toolCalls: ToolCall[]
	/** True while the turn is still streaming — drives the caret. */
	streaming: boolean
}

/**
 * The wire between transport and store. The store reduces these into
 * `ChatMessage` state via a single pure reducer, so a real transport only has
 * to emit the same events to drive the same UI.
 */
export type ChatEvent =
	| { type: "message-start"; messageId: string; role: "assistant" }
	| { type: "text-delta"; messageId: string; delta: string }
	| {
			type: "tool-call-start"
			messageId: string
			toolCall: Pick<ToolCall, "id" | "name" | "argsSummary">
	  }
	| {
			type: "tool-call-end"
			messageId: string
			toolCallId: string
			status: Exclude<ToolCallStatus, "running">
			resultSummary?: string
			error?: string
	  }
	| { type: "message-end"; messageId: string }

/**
 * The seam contract ARG-37 implements. Given the user's text, yield events.
 * The mock is the current implementation; the real server loop is a drop-in.
 */
export type ChatTransport = (userText: string) => AsyncIterable<ChatEvent>
