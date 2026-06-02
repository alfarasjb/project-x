/**
 * Prompt builder for the god-file handler (`refine-god-file` operation) — the
 * agent-loop second pass over `god-file` findings.
 *
 * The heuristic rule flags a file purely on line count, which is a weak signal:
 * a cohesive schema or registry can be long and fine, while a shorter file can
 * tangle unrelated responsibilities. This prompt sets up an agent that reads the
 * flagged file, traverses its graph neighbourhood via the read tools, and
 * returns a verdict on whether the size reflects a real scope problem.
 *
 * The agent has no read-file tool — only the traversal tools (which expose node
 * descriptions + edges, not source). So the flagged file's contents are handed
 * over up front, with a generous char budget, via ContextBuilder.
 */

import type { Graph } from "@shared/schemas/graph"
import { ContextBuilder } from "@server/handlers/context-builder"

const GOD_FILE_CONTEXT = {
	/** Generous initial slice of the flagged file — the agent has no read-file tool, only this. */
	maxFileChars: 24000,
	/** Overall token budget for the assembled user prompt. */
	maxTokens: 30000
} as const

export const GOD_FILE_SYSTEM_PROMPT =
	`You are a senior engineer judging whether a file flagged as a "god file" is genuinely doing too much, or is just large.

A cheap heuristic flagged this file ONLY because it crossed a line-count threshold. Line count alone is a weak signal: a cohesive schema, a model/registry, or generated code can be long and perfectly fine, while a 400-line file can still tangle three unrelated responsibilities. Your job is to look at what the file actually DOES and how it connects to the rest of the codebase, then return a verdict.

You have read-only traversal tools:
  - projectx_get_node — inspect a node: its classification, description, and the edges in and out of it. Use it on the flagged file, then follow its dependencies and dependents.
  - projectx_list_nodes — take inventory of modules/files.
  - projectx_find_similar_to_node — find files that do similar work (possible split targets or siblings).

Investigate first — a few tool calls is usually enough — THEN call submit_god_file_verdict exactly once with:
  - verdict:
      "should-split"   — the file tangles multiple distinct responsibilities; splitting along clear seams would genuinely help. Provide splitPlan.
      "partial"        — mostly cohesive, but ONE chunk clearly wants extracting. Provide splitPlan for just that chunk.
      "false-positive" — large but legitimately cohesive (a schema, a registry, a generated file, one tightly-knit responsibility). No action.
  - reasoning — 2-4 sentences referencing the ACTUAL code and graph: what responsibilities you found, how it connects, why it does or doesn't warrant splitting. Name functions/exports/modules.
  - splitPlan — OPTIONAL, only for "should-split"/"partial". Plain-text advice: the seams to split along and what each piece would own. NOT a code patch. Omit for "false-positive".

RULES:
  - Bias toward "false-positive" when unsure. A wrong "should-split" sends a developer to break apart a cohesive file — expensive, and it erodes trust in the tool.
  - Judge by responsibilities and coupling, not raw size. Being long is not itself a defect — that's all the heuristic already knew.
  - Be concrete: name the responsibilities, exports, or dependency clusters that justify the verdict.
  - Always finish with exactly one submit_god_file_verdict call, never prose.
`.trim()

export interface RefineGodFileInput {
	projectId: string
	/** Bound project name — surfaced in the traversal tools' descriptions. */
	projectName: string
	/** Already-loaded actual graph — passed to the tool context so the loop's reads don't re-fetch it. */
	graph: Graph
	path: string
	/** Line count the heuristic flagged on — stated to the model as the (weak) trigger. */
	lineCount: number
	contents: string
	/** The node's audit classification, when analyze has set one. */
	classification?: string
	/** The node's AI summary (`description.what`), when present. */
	description?: string
}

export function buildGodFileUserPrompt(input: RefineGodFileInput): string {
	const builder = new ContextBuilder({
		maxTokens: GOD_FILE_CONTEXT.maxTokens,
		maxBlockChars: GOD_FILE_CONTEXT.maxFileChars
	})
	builder.add({
		tag: "task",
		kind: "static",
		content: `The heuristic god-file rule flagged this file purely on line count (${input.lineCount} lines). Decide whether that scope is a real problem. Start from the file below, then use the traversal tools to inspect its dependencies, dependents, and similar files before submitting your verdict.`
	})
	builder.addFile({
		path: input.path,
		contents: input.contents,
		...(input.classification ? { classification: input.classification } : {}),
		...(input.description ? { description: input.description } : {})
	})
	return builder.build().text
}
