/**
 * Provider-neutral content blocks. Text-only for now — the analyze pipeline
 * is text-in/text-out, so multimodal blocks are deferred. The block union is
 * kept for the day we want to send images (e.g. screenshots) to a vision
 * model without restructuring the adapter interface.
 */

export interface TextBlock {
	type: "text"
	text: string
}

export type ContentBlock = TextBlock

/** A user message — provider-neutral. The system prompt is a separate field. */
export interface UserMessage {
	role: "user"
	content: string | ContentBlock[]
}
