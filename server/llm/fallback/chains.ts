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

/** 1-shot operations — served by `getAdapter` (LlmAdapter / FallbackLlmAdapter). */
export type LlmOperation = "analyze-node" | "refine-duplicate-cluster"
/**
 * Multi-step agent-loop operations. `refine-god-file` is served by the batch
 * `getAgentAdapter` (AgentAdapter); `qa-agent` is served by the streaming
 * `getStreamingAgentRuntime` (hand-wired loop in `server/agent/`). Both draw
 * their model + config from the shared registry below.
 */
export type AgentOperation = "refine-god-file" | "qa-agent"
/**
 * Every LLM operation. `FALLBACK_CHAINS` / `TASK_CONFIGS` are keyed by this
 * union so both adapter kinds share the registry, but the factory getters narrow
 * to `LlmOperation` / `AgentOperation` so a 1-shot op can't be handed to the
 * agent factory (or vice-versa) by mistake.
 */
export type Operation = LlmOperation | AgentOperation

export interface ChainEntry {
	provider: Provider
	model: string
}

export const FALLBACK_CHAINS: Record<Operation, readonly ChainEntry[]> = {
	// Haiku is the right tool: one-paragraph classify + describe doesn't need
	// Sonnet/Opus and Haiku is ~10x cheaper per token. Reconsider only if a
	// 50-node sample shows obvious quality regressions.
	"analyze-node": [{ provider: "anthropic", model: AI_MODELS.ANTHROPIC_HAIKU }],
	// Sonnet, not Haiku: judging whether N files genuinely duplicate (and
	// splitting out proximity-only members) is a reasoning task where Haiku
	// over-confidently merges. This runs on a handful of clusters per analyze,
	// not every node, so the cost delta is small.
	"refine-duplicate-cluster": [{ provider: "anthropic", model: AI_MODELS.ANTHROPIC_SONNET }],
	// Sonnet: a multi-step agent loop that traverses the graph to justify or
	// refute a god-file flag. Same reasoning-over-cost call as duplicate refine,
	// and it runs on at most a handful of god files per analyze.
	"refine-god-file": [{ provider: "anthropic", model: AI_MODELS.ANTHROPIC_SONNET }],
	// Sonnet: an interactive agent that traverses the graph to answer a user's
	// architecture questions. Reasoning over multi-step traversal is the job, and
	// it's user-initiated (one chat turn at a time), so the Sonnet cost is fine.
	"qa-agent": [{ provider: "anthropic", model: AI_MODELS.ANTHROPIC_SONNET }]
}

export interface TaskConfig {
	temperature: number
	maxOutputTokens: number
}

export const TASK_CONFIGS: Record<Operation, TaskConfig> = {
	// Low temp because we want stable classifications across crawls; 800 tokens
	// is plenty for the `analyze_node` tool_use payload (classification enum +
	// 1-2 sentence what + optional why).
	"analyze-node": { temperature: 0.2, maxOutputTokens: 800 },
	// Slightly higher temp than analyze (still low) and a bigger budget: the
	// payload is verdict + 2-4 sentence reasoning + a consolidation paragraph +
	// an optional excluded list.
	"refine-duplicate-cluster": { temperature: 0.3, maxOutputTokens: 1200 },
	// Per-turn budget for the agent loop: each turn is either a tool call or the
	// final verdict (verdict + reasoning + a split-plan paragraph). The loop's
	// step cap lives with the handler, not here — this config is per-call.
	"refine-god-file": { temperature: 0.3, maxOutputTokens: 1500 },
	// Per-turn budget for the QA chat loop: a turn is either a tool request or a
	// prose answer, so a bigger token cap than the structured verdict above. The
	// loop's step cap lives with `server/agent/`, not here.
	"qa-agent": { temperature: 0.3, maxOutputTokens: 2048 }
}

/**
 * Embedding model registry — parallel to AI_MODELS, kept separate because
 * embedding providers (Voyage) and chat providers (Anthropic) have no
 * overlap in v1 and conflating them would force fake `provider: "voyage"`
 * entries into the chat chains.
 */
export const EMBEDDING_MODELS = {
	VOYAGE_CODE_3: "voyage-code-3"
} as const

export type EmbeddingProvider = "voyage"

export type EmbeddingOperation = "embed-node"

export interface EmbeddingChainEntry {
	provider: EmbeddingProvider
	model: string
	/** Output vector dimensionality the adapter requests + the DB column expects. */
	dimensions: number
}

/**
 * One entry today — Voyage's `voyage-code-3` at the default 1024 dims. This
 * shape leaves room for a future fallback (OpenAI text-embedding-3) without
 * a refactor; for now we don't pay the cost of building one we won't use.
 */
export const EMBEDDING_CHAINS: Record<EmbeddingOperation, readonly EmbeddingChainEntry[]> = {
	"embed-node": [{ provider: "voyage", model: EMBEDDING_MODELS.VOYAGE_CODE_3, dimensions: 1024 }]
}
