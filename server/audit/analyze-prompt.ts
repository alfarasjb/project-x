/**
 * Analyze-prompt builder for the `analyze-node` operation.
 *
 * The system prompt explains what we want and what NOT to do (no path-
 * sniffing, no import-list paraphrasing). The user prompt is per-file:
 * the path, the truncated contents, and — for modules — the list of
 * direct children.
 *
 * Kept deliberately lean. We explored expanding the prompt to clear
 * Anthropic's prompt-cache minimum (4,096 tokens for Haiku 4.5) but the
 * tradeoff was wrong: padding a system prompt to chase a cache hit is
 * paying for tokens we don't believe in. If we ever want to lean on the
 * model more, enabling extended thinking is a better lever than bigger
 * instructions.
 */

export const ANALYZE_SYSTEM_PROMPT =
	`You are a senior engineer reading one file (or module) at a time to classify and describe it for an architectural co-pilot.

You will be called once per file. For each one, return a single tool call to "analyze_node" with:
  - classification: the *role* the code plays (what it IS, not where it lives).
  - description.what: a concise 1-2 sentence summary of what the file does (the searchable summary).
  - description.why: optional rationale — why it exists or its design intent. Skip for trivial files.

CLASSIFICATIONS (pick exactly one):
  - "business-logic"   — domain operations: auth flows, payment processing, the rules that make the product the product
  - "routing"          — HTTP routes / request handlers / page routes; thin glue to the domain
  - "data-access"      — DB queries, persistence, ORM models, schema, migrations
  - "ui-component"     — React/Vue/Svelte components, UI primitives
  - "utility"          — generic helpers with no domain knowledge (formatters, cn, lodash-likes)
  - "config"           — env loading, build/lint/runtime config, app wiring
  - "type-definition"  — pure type/interface declarations, schema-as-types
  - "unknown"          — genuinely can't tell after reading the code; safer than guessing

RULES:
  - READ THE CODE, not the path. A utils.ts full of DB queries is data-access; a routes file that's mostly business rules is business-logic. The whole point of classification is to catch misplacements.
  - For modules, classify by what the *contents* do collectively, given the listed children.
  - Description "what" is the SEARCHABLE summary an agent will match on. Be specific about responsibility. Do NOT paraphrase the import list ("imports X and Y to do Z"). Identify the responsibility ("X-y-z").
  - One file = one tool call. Always call analyze_node, never reply with prose.
`.trim()

const MAX_FILE_CHARS = 6000

export interface AnalyzeFileInput {
	path: string
	kind: "file" | "module"
	contents: string
	/** Module nodes pass their direct child paths; files leave this empty. */
	childPaths?: readonly string[]
}

export function buildAnalyzeUserPrompt(input: AnalyzeFileInput): string {
	const header = `Node path: ${input.path}\nKind: ${input.kind}`
	if (input.kind === "module") {
		const children = (input.childPaths ?? []).slice(0, 50).join("\n")
		return `${header}\nDirect children:\n${children || "(empty module)"}`
	}
	const { text, truncated } = truncate(input.contents)
	const truncatedNote = truncated
		? `\n\n[truncated to ${MAX_FILE_CHARS} chars from ${input.contents.length}]`
		: ""
	return `${header}\n\n--- file contents ---\n${text}${truncatedNote}`
}

function truncate(text: string): { text: string; truncated: boolean } {
	if (text.length <= MAX_FILE_CHARS) return { text, truncated: false }
	return { text: text.slice(0, MAX_FILE_CHARS), truncated: true }
}
