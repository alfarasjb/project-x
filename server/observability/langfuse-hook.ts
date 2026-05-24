import { updateActiveObservation } from "@langfuse/tracing"
import type { ObservabilityHook } from "@server/llm/types/observability"

/**
 * Langfuse implementation of `ObservabilityHook`.
 *
 * Each hook method enriches the *currently active* span (created by an
 * outer `observe()` call in the fallback adapter) via
 * `updateActiveObservation`. No spans are created here — that's the
 * fallback adapter's job; this just attaches input / output / usage data
 * so Langfuse can render the trace with cost + token attribution.
 *
 * Cost is calculated server-side by Langfuse from `model` + `usageDetails`
 * as long as the model is registered (Anthropic / OpenAI / Google ship
 * by default; Voyage needs one-time manual registration in the Langfuse
 * UI when PR B lands).
 */
export const langfuseHook: ObservabilityHook = {
	onGenerationStart({ provider, model, config, structuredTool }) {
		// ChatML-shaped messages render cleanly in the Langfuse playground;
		// stringify non-text content so JSON arrays of blocks still serialize.
		const messages: { role: string; content: string }[] = []
		if (config.systemPrompt) {
			messages.push({ role: "system", content: config.systemPrompt })
		}
		if (config.userPrompt !== undefined) {
			const content =
				typeof config.userPrompt === "string"
					? config.userPrompt
					: JSON.stringify(config.userPrompt)
			messages.push({ role: "user", content })
		}
		updateActiveObservation(
			{
				input: messages,
				model,
				modelParameters: {
					...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
					...(config.maxOutputTokens !== undefined
						? { maxOutputTokens: config.maxOutputTokens }
						: {})
				},
				metadata: {
					provider,
					...(structuredTool ? { tool: structuredTool.name } : {})
				}
			},
			{ asType: "generation" }
		)
	},

	onGenerationComplete(result) {
		updateActiveObservation(
			{
				output:
					typeof result.content === "string" ? result.content : JSON.stringify(result.content),
				model: result.model,
				usageDetails: {
					input: result.usage.inputTokens,
					output: result.usage.outputTokens,
					total: result.usage.inputTokens + result.usage.outputTokens
				}
			},
			{ asType: "generation" }
		)
	},

	onGenerationError(error) {
		const message = error instanceof Error ? error.message : String(error)
		updateActiveObservation({ level: "ERROR", statusMessage: message }, { asType: "generation" })
	},

	onEmbeddingStart({ provider, model, input }) {
		updateActiveObservation(
			{
				input: Array.isArray(input) ? input : [input],
				model,
				metadata: { provider, batchSize: Array.isArray(input) ? input.length : 1 }
			},
			{ asType: "embedding" }
		)
	},

	onEmbeddingComplete({ provider, model, dimensions, usage }) {
		updateActiveObservation(
			{
				model,
				metadata: { provider, dimensions },
				...(usage
					? {
							usageDetails: {
								...(usage.inputTokens !== undefined ? { input: usage.inputTokens } : {}),
								...(usage.totalTokens !== undefined ? { total: usage.totalTokens } : {})
							}
						}
					: {})
			},
			{ asType: "embedding" }
		)
	},

	onEmbeddingError(error) {
		const message = error instanceof Error ? error.message : String(error)
		updateActiveObservation({ level: "ERROR", statusMessage: message }, { asType: "embedding" })
	}
}
