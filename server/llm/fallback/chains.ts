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

/**
 * 1-shot operations — served by `getAdapter` (LlmAdapter / FallbackLlmAdapter).
 * Declared as a const object (like `AI_MODELS`) so the operation names are a
 * single source of truth: the `FALLBACK_CHAINS` / `TASK_CONFIGS` keys and every
 * call site reference these constants instead of duplicating the string literal.
 */
export const LLM_OPERATIONS = {
	ANALYZE_NODE: "analyze-node",
	LABEL_CLUSTER: "label-cluster",
	REFINE_DUPLICATE_CLUSTER: "refine-duplicate-cluster",
	REFINE_CIRCULAR_DEPENDENCY: "refine-circular-dependency"
} as const
export type LlmOperation = (typeof LLM_OPERATIONS)[keyof typeof LLM_OPERATIONS]

/** Multi-step agent-loop operations — served by `getAgentAdapter` (AgentAdapter). */
export const AGENT_OPERATIONS = {
	REFINE_GOD_FILE: "refine-god-file",
	REFINE_BOUNDARY_VIOLATION: "refine-boundary-violation",
	QA_AGENT: "qa-agent"
} as const
export type AgentOperation = (typeof AGENT_OPERATIONS)[keyof typeof AGENT_OPERATIONS]

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
	[LLM_OPERATIONS.ANALYZE_NODE]: [{ provider: "anthropic", model: AI_MODELS.ANTHROPIC_HAIKU }],
	// Haiku: naming a subsystem from its files' already-written summaries is the
	// same light "read + label" shape as analyze-node, runs on a handful of
	// clusters per analyze, and feeds a one-line Sonnet bump here if labels read weak.
	[LLM_OPERATIONS.LABEL_CLUSTER]: [{ provider: "anthropic", model: AI_MODELS.ANTHROPIC_HAIKU }],
	// Sonnet, not Haiku: judging whether N files genuinely duplicate (and
	// splitting out proximity-only members) is a reasoning task where Haiku
	// over-confidently merges. This runs on a handful of clusters per analyze,
	// not every node, so the cost delta is small.
	[LLM_OPERATIONS.REFINE_DUPLICATE_CLUSTER]: [
		{ provider: "anthropic", model: AI_MODELS.ANTHROPIC_SONNET }
	],
	// Sonnet: a multi-step agent loop that traverses the graph to justify or
	// refute a god-file flag. Same reasoning-over-cost call as duplicate refine,
	// and it runs on at most a handful of god files per analyze.
	[AGENT_OPERATIONS.REFINE_GOD_FILE]: [
		{ provider: "anthropic", model: AI_MODELS.ANTHROPIC_SONNET }
	],
	// Sonnet: judging whether an import cycle is genuinely harmful, tolerable
	// (type/test-only), or a parser artifact is a reasoning task — Haiku rubber-stamps.
	// Runs on a handful of cycles per analyze, so the cost delta is small.
	[LLM_OPERATIONS.REFINE_CIRCULAR_DEPENDENCY]: [
		{ provider: "anthropic", model: AI_MODELS.ANTHROPIC_SONNET }
	],
	// Sonnet: an agent loop that traverses the source file's neighbourhood to judge
	// whether a cross-layer import is a real breach or a justified exception. Same
	// reasoning-over-cost call as the god-file loop; a handful of findings per analyze.
	[AGENT_OPERATIONS.REFINE_BOUNDARY_VIOLATION]: [
		{ provider: "anthropic", model: AI_MODELS.ANTHROPIC_SONNET }
	],
	[AGENT_OPERATIONS.QA_AGENT]: [{ provider: "anthropic", model: AI_MODELS.ANTHROPIC_SONNET }]
}

export interface TaskConfig {
	temperature: number
	maxOutputTokens: number
}

export const TASK_CONFIGS: Record<Operation, TaskConfig> = {
	// Low temp because we want stable classifications across crawls; 800 tokens
	// is plenty for the `analyze_node` tool_use payload (classification enum +
	// 1-2 sentence what + optional why).
	[LLM_OPERATIONS.ANALYZE_NODE]: { temperature: 0.2, maxOutputTokens: 800 },
	// Low temp for stable names across re-analyze; a Title-Case label + one
	// sentence fits comfortably under 320 tokens.
	[LLM_OPERATIONS.LABEL_CLUSTER]: { temperature: 0.3, maxOutputTokens: 320 },
	// Slightly higher temp than analyze (still low) and a bigger budget: the
	// payload is verdict + 2-4 sentence reasoning + a consolidation paragraph +
	// an optional excluded list.
	[LLM_OPERATIONS.REFINE_DUPLICATE_CLUSTER]: { temperature: 0.3, maxOutputTokens: 1200 },
	// Per-turn budget for the agent loop: each turn is either a tool call or the
	// final verdict (verdict + reasoning + a split-plan paragraph). The loop's
	// step cap lives with the handler, not here — this config is per-call.
	[AGENT_OPERATIONS.REFINE_GOD_FILE]: { temperature: 0.3, maxOutputTokens: 1500 },
	// 1-shot, same shape as duplicate refine: verdict + reasoning + an optional
	// resolution paragraph.
	[LLM_OPERATIONS.REFINE_CIRCULAR_DEPENDENCY]: { temperature: 0.3, maxOutputTokens: 1200 },
	// Per-turn budget for the boundary agent loop — verdict + reasoning + an
	// optional remediation paragraph. Step cap lives with the handler.
	[AGENT_OPERATIONS.REFINE_BOUNDARY_VIOLATION]: { temperature: 0.3, maxOutputTokens: 1500 },
	[AGENT_OPERATIONS.QA_AGENT]: { temperature: 0.3, maxOutputTokens: 2480 }
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

/** Embedding operations — const object, same single-source-of-truth pattern as `LLM_OPERATIONS`. */
export const EMBEDDING_OPERATIONS = {
	EMBED_NODE: "embed-node"
} as const
export type EmbeddingOperation = (typeof EMBEDDING_OPERATIONS)[keyof typeof EMBEDDING_OPERATIONS]

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
	[EMBEDDING_OPERATIONS.EMBED_NODE]: [
		{ provider: "voyage", model: EMBEDDING_MODELS.VOYAGE_CODE_3, dimensions: 1024 }
	]
}
