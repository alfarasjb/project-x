import type { Edge, Node } from "@xyflow/react"

/**
 * Project X co-pilot agent — flat planning view (ARG-25 fixture).
 *
 * A feature flow at *planning granularity*: the seven components we need to
 * ship the eventual agent, each as a standalone node, connected by the
 * dependencies that matter when deciding what to build next. Status badges
 * baked into the label (— present / — intent) say what's already wired in
 * this repo vs what's the next slice of work.
 *
 * Deliberately FLAT — no parent/child nesting. The granular drill-down
 * (ContextBuilder's 5-step pipeline + cache layers, the MCP tool surface's
 * individual tools, the harness's stream/dispatch loop, etc.) is a future
 * view that expands a single planning node into its internals — a separate
 * subissue, not ARG-25's job.
 *
 * Self-referential dogfood: every `present` node anchors to something
 * already in this repo (`server/mcp/index.ts`, `server/llm/adapters/`,
 * `server/db/schema/projects.ts`); every `intent` node is something we'll
 * ship. When the agent lands those labels flip, and ARG-11 derives the flip
 * automatically by diffing the sketch against the parsed graph — making
 * this the first real bidirectional drift case.
 */

const ID = "project-x-agent"
const id = (suffix: string): string => `${ID}/${suffix}`

/** Each planning-grain component shows up as a single flat module node. */
const node = (params: {
	suffix: string
	label: string
	layer: "ui" | "service" | "data"
	position: { x: number; y: number }
	statsLabel?: string
}): Node => ({
	id: id(params.suffix),
	type: "module",
	position: params.position,
	style: { width: 280, height: 90 },
	data: {
		label: params.label,
		path: `feature/co-pilot/${params.suffix}`,
		layer: params.layer,
		...(params.statsLabel !== undefined ? { statsLabel: params.statsLabel } : {})
	}
})

export const projectXAgentFeatureFlowNodes: Node[] = [
	// --- Col 1: user-facing entry ---------------------------------------
	node({
		suffix: "chat-popout",
		label: "Chat popout UI — intent",
		layer: "ui",
		position: { x: 40, y: 280 }
	}),

	// --- Col 2: the harness everything else hangs off -------------------
	node({
		suffix: "harness",
		label: "Agent harness — intent",
		layer: "service",
		position: { x: 380, y: 280 },
		statsLabel: "stream · dispatch · persist"
	}),

	// --- Col 3: the four pieces the harness composes --------------------
	node({
		suffix: "context-builder",
		label: "ContextBuilder — intent",
		layer: "service",
		position: { x: 720, y: 80 },
		statsLabel: "5-step pipeline · ≤4 BPs"
	}),
	node({
		suffix: "llm-adapter",
		label: "LLM adapter — present",
		layer: "service",
		position: { x: 720, y: 200 },
		statsLabel: "tool_use streaming"
	}),
	node({
		suffix: "mcp-tools",
		label: "MCP tool surface — present",
		layer: "service",
		position: { x: 720, y: 320 },
		statsLabel: "8 tools · 2 intent"
	}),
	node({
		suffix: "threads",
		label: "Agent threads — intent",
		layer: "data",
		position: { x: 720, y: 440 },
		statsLabel: "messages · persistence"
	}),

	// --- Col 4: shared storage backing the data-touching components -----
	node({
		suffix: "graph-storage",
		label: "Graph storage — present",
		layer: "data",
		position: { x: 1060, y: 280 },
		statsLabel: "actual + intent + issues + embeddings"
	})
]

/**
 * Edge ids embed source → target so collisions are impossible and the id is
 * self-describing in devtools.
 */
const edge = (source: string, target: string, label?: string): Edge => ({
	id: `${source}->${target}`,
	source,
	target,
	type: "default",
	...(label !== undefined ? { label } : {})
})

export const projectXAgentFeatureFlowEdges: Edge[] = [
	// User-facing entry into the harness
	edge(id("chat-popout"), id("harness"), "user message"),

	// Harness composes the four pieces in col 3
	edge(id("harness"), id("context-builder"), "build context"),
	edge(id("harness"), id("llm-adapter"), "stream + tools"),
	edge(id("harness"), id("mcp-tools"), "dispatch"),
	edge(id("harness"), id("threads"), "persist"),

	// Data-touching pieces read/write the shared graph storage
	edge(id("context-builder"), id("graph-storage"), "snapshot"),
	edge(id("mcp-tools"), id("graph-storage"), "read / write")
]
