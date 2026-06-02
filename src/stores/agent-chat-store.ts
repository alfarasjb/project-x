import { create } from "zustand"
import { ApiError } from "@/lib/api"
import type {
	ChatEvent,
	ChatMessage,
	ChatTransport,
	ToolCall
} from "@/components/graph/agent/types"

/**
 * QA Agent chat state — the first Zustand store in the repo, one store per
 * concern. Holds the message list and the turn status; everything UI-side reads
 * from here. `applyEvent` is the single pure reducer over `ChatEvent`, kept
 * separate from `runTurn` so ARG-37's real transport can feed the same reducer
 * from SSE without changing how messages are built.
 */

export type ChatStatus = "idle" | "thinking" | "streaming"

interface AgentChatState {
	messages: ChatMessage[]
	status: ChatStatus
	/** Reduce one transport event into message state. Pure w.r.t. inputs. */
	applyEvent: (event: ChatEvent) => void
	/** Push a user turn onto the stream. */
	appendUserMessage: (text: string) => void
	/**
	 * End a turn that errored: append `text` to the in-flight assistant bubble
	 * (finalizing it), or start a fresh assistant message when the failure hit
	 * before any bubble was created.
	 */
	failTurn: (text: string) => void
	reset: () => void
	/**
	 * Drive a whole turn: push the user message, enter `thinking`, then consume
	 * the transport's event stream into state. The only stateful boundary —
	 * swap `transport` (mock → server) and the rest is unchanged.
	 */
	runTurn: (transport: ChatTransport, userText: string) => Promise<void>
}

/** Patch the tool call matching `toolCallId` within one message's list. */
const patchToolCall = (
	toolCalls: ToolCall[],
	toolCallId: string,
	patch: Partial<ToolCall>
): ToolCall[] => toolCalls.map((call) => (call.id === toolCallId ? { ...call, ...patch } : call))

/** Apply `patch` to the message matching `messageId`, leaving others untouched. */
const patchMessage = (
	messages: ChatMessage[],
	messageId: string,
	patch: (message: ChatMessage) => ChatMessage
): ChatMessage[] => messages.map((message) => (message.id === messageId ? patch(message) : message))

export const useAgentChatStore = create<AgentChatState>((set, get) => ({
	messages: [],
	status: "idle",

	applyEvent: (event) =>
		set((state) => {
			switch (event.type) {
				case "message-start":
					return {
						messages: [
							...state.messages,
							{
								id: event.messageId,
								role: event.role,
								text: "",
								toolCalls: [],
								streaming: true
							}
						]
					}
				case "text-delta":
					return {
						messages: patchMessage(state.messages, event.messageId, (message) => ({
							...message,
							text: message.text + event.delta
						}))
					}
				case "tool-call-start":
					return {
						messages: patchMessage(state.messages, event.messageId, (message) => ({
							...message,
							toolCalls: [...message.toolCalls, { ...event.toolCall, status: "running" }]
						}))
					}
				case "tool-call-end":
					return {
						messages: patchMessage(state.messages, event.messageId, (message) => ({
							...message,
							toolCalls: patchToolCall(message.toolCalls, event.toolCallId, {
								status: event.status,
								resultSummary: event.resultSummary,
								error: event.error
							})
						}))
					}
				case "message-end":
					return {
						messages: patchMessage(state.messages, event.messageId, (message) => ({
							...message,
							streaming: false
						}))
					}
			}
		}),

	appendUserMessage: (text) =>
		set((state) => ({
			messages: [
				...state.messages,
				{ id: crypto.randomUUID(), role: "user", text, toolCalls: [], streaming: false }
			]
		})),

	failTurn: (text) =>
		set((state) => {
			const inFlight = [...state.messages].reverse().find((message) => message.streaming)
			if (inFlight) {
				return {
					messages: patchMessage(state.messages, inFlight.id, (message) => ({
						...message,
						text: message.text ? `${message.text}\n\n${text}` : text,
						streaming: false
					}))
				}
			}
			return {
				messages: [
					...state.messages,
					{ id: crypto.randomUUID(), role: "assistant", text, toolCalls: [], streaming: false }
				]
			}
		}),

	reset: () => set({ messages: [], status: "idle" }),

	runTurn: async (transport, userText) => {
		if (get().status !== "idle") return

		get().appendUserMessage(userText)
		set({ status: "thinking" })

		try {
			for await (const event of transport(userText)) {
				// First content lands → leave the thinking shimmer, start streaming.
				if (get().status === "thinking") set({ status: "streaming" })
				get().applyEvent(event)
			}
		} catch (error) {
			// The transport threw — a pre-stream failure (an ApiError with a
			// user-facing message: missing key / no graph / auth) or a mid-stream
			// one (a bad SSE frame). Surface it in the chat and finalize any bubble
			// left streaming, so the user gets feedback instead of a silent failure
			// or a caret that blinks forever.
			get().failTurn(toErrorText(error))
		} finally {
			// Always re-enable the composer — covers normal completion and errors.
			set({ status: "idle" })
		}
	}
}))

/** A user-facing line for a failed turn: the server's message for an ApiError, else a generic one. */
function toErrorText(error: unknown): string {
	if (error instanceof ApiError) return error.message
	return "Something went wrong talking to the agent. Please try again."
}
