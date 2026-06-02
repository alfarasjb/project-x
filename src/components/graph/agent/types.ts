/**
 * QA Agent chat — the typed seam between the UI and whatever produces messages.
 *
 * The wire events (`ChatEvent`) and their sub-types now live in the shared Zod
 * schema (`@shared/schemas/chat`) — ARG-37's server loop validates against it and
 * the frontend infers from it, so the contract can't drift. We re-export those
 * here so existing `@/components/graph/agent/types` imports keep resolving; the
 * render-state shapes (`ToolCall`, `ChatMessage`, `ChatTransport`) stay local
 * because they're UI concerns, not wire.
 *
 * The event stream is deliberately transport-agnostic: a `ChatTransport` is
 * just `(userText) => AsyncIterable<ChatEvent>`, which an SSE / ReadableStream /
 * WebSocket source maps onto without reshaping this contract.
 */

import type { ChatEvent, ChatRole, ToolCallStatus } from "@shared/schemas/chat"

export type { ChatEvent, ChatRole, ToolCallStatus }

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
 * The seam contract ARG-37 implements. Given the user's text, yield events.
 * The mock is the current implementation; the real server loop is a drop-in.
 */
export type ChatTransport = (userText: string, signal?: AbortSignal) => AsyncIterable<ChatEvent>
