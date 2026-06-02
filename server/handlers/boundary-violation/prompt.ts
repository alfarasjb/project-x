/**
 * Prompt builder for the boundary-violation handler
 * (`refine-boundary-violation` operation) — the agent-loop second pass over the
 * heuristic `boundary-violation` findings.
 *
 * The rule flags a file-to-file import whose classification pair crosses an
 * architectural layer (e.g. a `routing` file importing `data-access`). That's a
 * useful signal but a blunt one: whether the edge is a real breach depends on
 * context the two files alone don't reveal — is there a domain layer that should
 * sit between them? Is the target a thin re-export? Is the source a legitimate
 * composition root? Answering well wants graph traversal, so this is an agent
 * loop (like god-file), not a 1-shot call.
 *
 * The agent has no read-file tool — only the traversal tools (node descriptions
 * + edges, not source). So the flagged SOURCE file's contents are handed over up
 * front via ContextBuilder; the agent inspects the targets through the graph.
 */

import type { Graph } from "@shared/schemas/graph"
import { ContextBuilder } from "@server/handlers/context-builder"

const BOUNDARY_CONTEXT = {
	/** Generous initial slice of the flagged source file — the agent has no read-file tool, only this. */
	maxFileChars: 24000,
	/** Overall token budget for the assembled user prompt. */
	maxTokens: 30000
} as const

export const BOUNDARY_SYSTEM_PROMPT =
	`You are a senior engineer judging whether a flagged cross-layer import is a genuine architectural boundary violation.

A cheap rule flagged this import ONLY because the source and target files carry classifications that shouldn't depend on each other (e.g. a route handler importing the data layer directly). Classification pairs are a blunt signal: the same edge can be a real breach in one codebase and a deliberate, fine exception in another. Your job is to look at what the source file actually imports and why, using the graph, then return a verdict.

You have read-only traversal tools:
  - projectx_get_node — inspect a node: its classification, description, and the edges in and out of it. Use it on the source file and each flagged target.
  - projectx_list_nodes — take inventory of modules/files (e.g. is there a domain/service layer the call should route through?).
  - projectx_find_similar_to_node — find files that do similar work (e.g. an existing wrapper the source should use instead).

Investigate first — a few tool calls is usually enough — THEN call submit_boundary_verdict exactly once with:
  - verdict:
      "violation"      — a genuine breach: the source reaches across a layer it shouldn't, and a cleaner path exists (route through the domain, use a hook/query layer). Provide remediation.
      "acceptable"     — crosses the layer on paper but is justified: a composition root / wiring file, a thin re-export, or a deliberate, documented exception. No action.
      "false-positive" — the classification is wrong, so this isn't really a cross-layer edge (e.g. the "data-access" target is actually a shared type module). No action.
  - reasoning — 2-4 sentences referencing the ACTUAL code and graph: what the source imports from each target, whether a layer should sit between them, why it does or doesn't breach. Name the imported symbols and modules.
  - remediation — OPTIONAL, only for "violation". Plain-text advice: what to reroute the import through and why. NOT a code patch. Omit for "acceptable"/"false-positive".

RULES:
  - Bias toward "acceptable"/"false-positive" when unsure. A wrong "violation" sends a developer to reroute an import that was fine — wasted effort that erodes trust in the tool.
  - Judge by the actual dependency and the layers around it, not the classification labels alone — those are all the heuristic already knew.
  - Be concrete: name the symbols the source imports and the layer it should go through instead.
  - Always finish with exactly one submit_boundary_verdict call, never prose.
`.trim()

export interface RefineBoundaryViolationInput {
	projectId: string
	/** Bound project name — surfaced in the traversal tools' descriptions. */
	projectName: string
	/** Already-loaded actual graph — passed to the tool context so the loop's reads don't re-fetch it. */
	graph: Graph
	/** The flagged source file (the importer) — `affected[0]` on the issue. */
	path: string
	contents: string
	/** The forbidden target paths the source imports, surfaced as the edges to inspect. */
	targets: readonly string[]
	/** The rule's per-target reasons (the issue description) — the (blunt) trigger, stated to the model. */
	violationDetail: string
	/** The source node's audit classification, when analyze has set one. */
	classification?: string
	/** The source node's AI summary (`description.what`), when present. */
	description?: string
}

export function buildBoundaryUserPrompt(input: RefineBoundaryViolationInput): string {
	const builder = new ContextBuilder({
		maxTokens: BOUNDARY_CONTEXT.maxTokens,
		maxBlockChars: BOUNDARY_CONTEXT.maxFileChars
	})
	const targetList = input.targets.map((target) => `  - ${target}`).join("\n")
	builder.add({
		tag: "task",
		kind: "static",
		content: `The boundary rule flagged this file for importing across an architectural layer. Its findings:\n${input.violationDetail}\n\nThe flagged target files to inspect:\n${targetList}\n\nStart from the source file below, then use the traversal tools to inspect the targets and the layers around them before submitting your verdict.`
	})
	// Direct assignment — addFile tolerates undefined (renderAttrs drops empty
	// attrs), so the optional meta doesn't need a conditional spread.
	builder.addFile({
		path: input.path,
		contents: input.contents,
		classification: input.classification,
		description: input.description
	})
	return builder.build().text
}
