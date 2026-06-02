/**
 * Prompt builder for the circular-dependency handler
 * (`refine-circular-dependency` operation) — the 1-shot judge over the heuristic
 * `circular-dependency` findings.
 *
 * The DFS rule reports any import cycle between files. That's a recall-tuned
 * signal: some cycles genuinely break tree-shaking and risk init-order bugs,
 * while others are harmless — a type-only import (erased at build time) or a
 * test helper reaching back into its subject. This prompt is the precision pass:
 * Claude reads the cycle's files and decides whether it's worth breaking.
 *
 * 1-shot (no agent loop), same shape as `duplicate-refinement/prompt.ts`: the
 * cycle is bounded and self-contained — its members ARE the evidence — so the
 * files are handed over up front and no graph traversal is needed.
 */

import { ContextBuilder } from "@server/handlers/context-builder"

const MAX_FILE_CHARS = 6000

export const REFINE_CIRCULAR_SYSTEM_PROMPT =
	`You are a senior engineer judging whether a circular import dependency between files is worth breaking.

A cheap DFS pass detected that these files import each other in a cycle. That pass is tuned for RECALL — it flags every cycle it finds, but not every cycle is a real problem. A cycle of type-only imports is erased at build time; a test file reaching back into its subject is expected. Other cycles genuinely break tree-shaking and cause initialization-order bugs (one module reads another that's still \`undefined\`). Your job is PRECISION: read the files and decide.

Return a single tool call to "refine_circular_dependency" with:
  - verdict:
      "break-cycle"    — a genuine runtime cycle that hurts: it risks init-order bugs, breaks tree-shaking, or muddies the boundary between these files. Provide resolution.
      "acceptable"     — a real cycle, but tolerable: type-only imports (erased at build), test-to-subject edges, or a tightly-coupled pair where the cycle is benign. Optionally provide resolution.
      "false-positive" — not actually a runtime cycle (e.g. the edge is a comment, a re-export the parser misread, or a dynamic import that doesn't execute at load). No action.
  - reasoning — 2-4 sentences referencing the ACTUAL code: which imports form the cycle, whether they're type-only / value / dynamic, and why that does or doesn't cause a problem. Name the imported symbols.
  - resolution — OPTIONAL, only for "break-cycle"/"acceptable". Plain-text advice: where to cut the cycle (extract a shared module, invert a dependency, make an import type-only). NOT a code patch. Omit for "false-positive".

RULES:
  - Bias toward "acceptable"/"false-positive" when unsure. A wrong "break-cycle" sends a developer to untangle imports that were fine — wasted effort that erodes trust in the tool.
  - Judge by what the imports DO at runtime, not by the existence of a cycle. A \`import type\` cycle is not a runtime cycle.
  - Be concrete: name the symbols each file imports from the next.
  - One cycle = one tool call. Always call refine_circular_dependency, never reply with prose.
`.trim()

export interface RefineCircularFile {
	path: string
	/** The node's audit classification, when analyze has set one. */
	classification?: string
	/** The node's AI summary (`description.what`), when present. */
	description?: string
	contents: string
}

export interface RefineCircularDependencyInput {
	/** The cycle's files, in cycle order — always 2 or more. */
	files: readonly RefineCircularFile[]
}

export function buildRefineCircularUserPrompt(input: RefineCircularDependencyInput): string {
	// Each member becomes a `<file path=… classification=… description=…>` block;
	// the per-block char cap is the same MAX_FILE_CHARS budget the duplicate prompt
	// uses. The cycle arrow names the import order so the model knows which file
	// depends on which.
	const builder = new ContextBuilder({ maxBlockChars: MAX_FILE_CHARS })
	for (const file of input.files) {
		// Direct assignment — addFile tolerates undefined (renderAttrs drops empty
		// attrs), so the optional meta doesn't need a conditional spread.
		builder.addFile({
			path: file.path,
			contents: file.contents,
			classification: file.classification,
			description: file.description
		})
	}
	const arrow = `${input.files.map((file) => file.path).join(" → ")} → ${input.files[0]?.path ?? ""}`
	return `These ${input.files.length} files form an import cycle: ${arrow}. Judge whether it's worth breaking.\n\n${builder.build().text}`
}
