/**
 * Prompt builder for the QA agent (`qa-agent` operation) — the hand-wired
 * streaming chat loop in `server/agent/`.
 *
 * The agent answers free-form questions about a project's architecture by
 * traversing its graph with the read-only tools. A compact `<graph-summary>`
 * block gives it the project's shape up front (so it doesn't burn a turn calling
 * `list_nodes` just to orient), and the user's `<question>` follows. Built via
 * the shared `ContextBuilder` so block formatting + budgeting matches the rest of
 * the LLM layer.
 */

import type { Graph } from "@shared/schemas/graph"
import { ContextBuilder } from "@server/handlers/context-builder"

const QA_AGENT_CONTEXT = {
	/** Budget for the assembled user prompt. The graph summary is small; the rest is the question. */
	maxTokens: 8000
} as const

export const QA_AGENT_SYSTEM_PROMPT =
	`You are a QA agent that answers questions about a software project's architecture by traversing its dependency graph.

You have four read-only tools:
  - projectx_search_similar_nodes — semantic search: find nodes whose descriptions best match a free-form text query ("where does auth happen?", "which file handles uploads?"). The right FIRST move when you're looking for code by intent and don't yet have a node in hand.
  - projectx_get_node — full detail for one node: its kind, layer, classification, description, and the edges in and out of it. Use it to TRACE A FLOW — get a node, follow one of its dependencies to the next node, call projectx_get_node again, and repeat.
  - projectx_list_nodes — inventory the project's modules and files, each with its current description and classification. Use it to take stock or to find nodes matching a kind/classification.
  - projectx_find_similar_to_node — once you've found one relevant node, find others that do similar work (possible duplicates or coupled peers).

Both similarity tools need the project to have been Analyzed (they read embeddings); if they return nothing, fall back to projectx_list_nodes + projectx_get_node.

A <graph-summary> block below gives you the project's overall shape. Use the tools to investigate specifics before answering — don't guess at structure you can look up.

When you have enough to answer, stop calling tools and reply in clear, concise prose. Ground every claim in what the graph actually shows: name the specific nodes (by their id / path), layers, and edges you relied on. If the graph doesn't contain enough to answer confidently, say so plainly rather than inventing detail. You are read-only — you observe and explain the architecture, you never modify it.`.trim()

export interface QaUserPromptInput {
	projectName: string
	/** Already-loaded actual graph — summarized into the prompt and passed to the tool context for traversal. */
	graph: Graph
	userMessage: string
}

export function buildQaUserPrompt(input: QaUserPromptInput): string {
	const builder = new ContextBuilder({ maxTokens: QA_AGENT_CONTEXT.maxTokens })
	builder.add({
		tag: "graph-summary",
		kind: "static",
		content: summarizeGraph(input.graph),
		attrs: { project: input.projectName }
	})
	builder.add({ tag: "question", kind: "tail", content: input.userMessage })
	return builder.build().text
}

/** Tally a list of labels into counts, preserving first-seen order. */
function tally(labels: readonly string[]): Map<string, number> {
	const counts = new Map<string, number>()
	for (const label of labels) {
		counts.set(label, (counts.get(label) ?? 0) + 1)
	}
	return counts
}

/** Render a tally as "file ×120, module ×34", highest count first. */
function formatTally(counts: Map<string, number>): string {
	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1])
		.map(([label, count]) => `${label} ×${count}`)
		.join(", ")
}

/** Compact, look-up-free overview of the graph so the agent starts oriented. */
function summarizeGraph(graph: Graph): string {
	const byKind = tally(graph.nodes.map((node) => node.kind))
	const byLayer = tally(graph.nodes.flatMap((node) => (node.layer ? [node.layer] : [])))
	const byClassification = tally(
		graph.nodes.flatMap((node) => (node.classification ? [node.classification] : []))
	)
	const lines: string[] = [
		`${graph.nodes.length} nodes, ${graph.edges.length} edges.`,
		`By kind: ${formatTally(byKind)}.`
	]
	if (byLayer.size > 0) lines.push(`By layer: ${formatTally(byLayer)}.`)
	if (byClassification.size > 0) lines.push(`By classification: ${formatTally(byClassification)}.`)
	return lines.join("\n")
}
