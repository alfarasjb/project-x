import { z } from "zod"

/**
 * QA Agent chat wire schema — the single source of truth for the events the
 * server agent loop streams to the browser. ARG-36 left these types frontend-only
 * (`src/components/graph/agent/types.ts`) because the server contract didn't
 * exist yet; ARG-37 promotes them here so both sides infer from one Zod schema
 * and the wire can't drift. The frontend `types.ts` re-exports the inferred
 * types; the server validates every event with `ChatEventSchema` before it hits
 * the socket.
 *
 * `ChatEvent` is the transport-neutral seam: the SSE transport and the store's
 * pure reducer both speak exactly these five variants. Render-state shapes
 * (`ToolCall`, `ChatMessage`, `ChatTransport`) stay frontend-local — they're UI
 * concerns, not wire.
 */

/** Who authored a message. */
export const ChatRoleSchema = z.enum(["user", "assistant"])
export type ChatRole = z.infer<typeof ChatRoleSchema>

/** Lifecycle of a single tool invocation. */
export const ToolCallStatusSchema = z.enum(["running", "done", "error"])
export type ToolCallStatus = z.infer<typeof ToolCallStatusSchema>

/**
 * One streamed event. A turn is framed by `message-start` … `message-end`; in
 * between, `text-delta`s grow the assistant text and `tool-call-start` /
 * `tool-call-end` pairs surface tool activity. `tool-call-end` carries either a
 * `resultSummary` (status `done`) or an `error` (status `error`) — a failed tool
 * is reported in-band, never as a transport-level throw.
 */
export const ChatEventSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("message-start"),
		messageId: z.string(),
		role: z.literal("assistant")
	}),
	z.object({
		type: z.literal("text-delta"),
		messageId: z.string(),
		delta: z.string()
	}),
	z.object({
		type: z.literal("tool-call-start"),
		messageId: z.string(),
		toolCall: z.object({
			id: z.string(),
			name: z.string(),
			/** Pre-summarized, human-readable args (e.g. `node: server/index.ts`). */
			argsSummary: z.string()
		})
	}),
	z.object({
		type: z.literal("tool-call-end"),
		messageId: z.string(),
		toolCallId: z.string(),
		status: z.enum(["done", "error"]),
		resultSummary: z.string().optional(),
		error: z.string().optional()
	}),
	z.object({
		type: z.literal("message-end"),
		messageId: z.string()
	})
])
export type ChatEvent = z.infer<typeof ChatEventSchema>
