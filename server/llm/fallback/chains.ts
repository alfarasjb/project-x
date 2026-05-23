/**
 * Centralized model registry and per-operation fallback chains.
 *
 * - `AI_MODELS` is the only place model ids live — upgrades are a one-line
 *   change here, never a call-site edit.
 * - `FALLBACK_CHAINS` maps an operation to the ordered providers/models to
 *   try. Today every chain is length 1 (Anthropic-only), but the structure
 *   is in place so PR-B or a future cross-provider day is a one-line edit.
 * - `TASK_CONFIGS` carries the default temperature + token budget per
 *   operation, so call sites pass the intent (`"analyze-node"`), not knobs.
 */

export const AI_MODELS = {
	ANTHROPIC_HAIKU: "claude-haiku-4-5-20251001",
	ANTHROPIC_SONNET: "claude-sonnet-4-6",
	ANTHROPIC_OPUS: "claude-opus-4-7"
} as const

export type AnthropicModel = (typeof AI_MODELS)[keyof typeof AI_MODELS]

export type Provider = "anthropic"

export type Operation = "analyze-node"

export interface ChainEntry {
	provider: Provider
	model: string
}

export const FALLBACK_CHAINS: Record<Operation, readonly ChainEntry[]> = {
	// Haiku is the right tool: one-paragraph classify + describe doesn't need
	// Sonnet/Opus and Haiku is ~10x cheaper per token. Reconsider only if a
	// 50-node sample shows obvious quality regressions.
	"analyze-node": [{ provider: "anthropic", model: AI_MODELS.ANTHROPIC_HAIKU }]
}

export interface TaskConfig {
	temperature: number
	maxOutputTokens: number
}

export const TASK_CONFIGS: Record<Operation, TaskConfig> = {
	// Low temp because we want stable classifications across crawls; 800 tokens
	// is plenty for the `analyze_node` tool_use payload (classification enum +
	// 1-2 sentence what + optional why).
	"analyze-node": { temperature: 0.2, maxOutputTokens: 800 }
}
