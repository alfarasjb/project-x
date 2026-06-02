import { create } from "zustand"
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

	reset: () => set({ messages: [], status: "idle" }),

	runTurn: async (transport, userText) => {
		if (get().status !== "idle") return

		get().appendUserMessage(userText)
		set({ status: "thinking" })

		for await (const event of transport(userText)) {
			// First content lands → leave the thinking shimmer, start streaming.
			if (get().status === "thinking") set({ status: "streaming" })
			get().applyEvent(event)
		}

		set({ status: "idle" })
	}
}))
