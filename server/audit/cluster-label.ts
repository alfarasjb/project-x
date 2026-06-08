import { posix } from "node:path"
import { z } from "zod"
import type { Cluster, Graph, GraphNode } from "@shared/schemas/graph"
import { getAdapter } from "@server/llm/fallback/factory"
import { LLM_OPERATIONS } from "@server/llm/fallback/chains"
import type { GenerationResult } from "@server/llm/types/result"
import { runWithConcurrency } from "@server/utils/concurrency"
import type { Partition } from "@server/domain/graph/cluster"

/**
 * Output schema sent to Claude as the `label_cluster` tool's input_schema.
 * Flat (like `AnalyzeOutputSchema`) so it round-trips without tool-call drift.
 */
export const ClusterLabelOutputSchema = z.object({
	label: z.string().min(1).max(80),
	description: z.string().min(1).max(280).optional()
})
export type ClusterLabelOutput = z.infer<typeof ClusterLabelOutputSchema>

const LABEL_TOOL = {
	name: "label_cluster",
	description: "Name and (optionally) describe the subsystem formed by the given files."
}

const CLUSTER_LABEL_SYSTEM_PROMPT =
	`You name one subsystem of a codebase. A community-detection pass grouped these files together because they import each other tightly — they form a unit. Return a single \`label_cluster\` tool call:
  - label: a short Title Case name for what these files collectively ARE or DO — a subsystem name like "Auth & Sessions", "Graph Analyze Pipeline", "LLM Adapter Layer". 2–5 words. Never a file path or a list.
  - description: optional, one sentence on the subsystem's responsibility. Omit if the label already says it.

RULES:
  - Name the SHARED responsibility, not a single file. Read the per-file summaries to find the common theme.
  - Avoid generic names ("Utilities", "Misc") unless the files genuinely share nothing more specific.
  - Title Case, no trailing punctuation in the label.
  - Always call label_cluster; never reply with prose.
`.trim()

/** How many member files to list in the prompt before summarising the rest. */
const MAX_MEMBERS_SHOWN = 40

/** Bounded fan-out — a handful of clusters per analyze, each one cheap Haiku call. */
const LABEL_CONCURRENCY = 8

interface LabelMember {
	path: string
	classification?: string
	summary?: string
}

interface ClusterLabelInput {
	totalCount: number
	members: readonly LabelMember[]
}

/**
 * Pure per-cluster LLM call — names one subsystem. Mirrors `analyzeNode`: no
 * graph mutation, structured output forced via tool_use, returns the full
 * `GenerationResult` so the caller can read token usage if it wants to.
 */
export async function labelCluster(
	input: ClusterLabelInput
): Promise<GenerationResult<ClusterLabelOutput>> {
	const adapter = getAdapter(LLM_OPERATIONS.LABEL_CLUSTER)
	return adapter.generateStructured(
		{ systemPrompt: CLUSTER_LABEL_SYSTEM_PROMPT, userPrompt: buildClusterLabelUserPrompt(input) },
		ClusterLabelOutputSchema,
		LABEL_TOOL
	)
}

/**
 * Label every cluster in a partition, returning the `Graph.clusters` registry.
 * Runs the per-cluster calls with bounded concurrency; a failed call falls back
 * to a directory-derived name so the cluster is never left without a label (the
 * stage degrades, it doesn't fail). Members come from the file nodes' already
 * AI-written summaries, so this runs AFTER `analyzeGraph`.
 */
export async function labelClusters(graph: Graph, partition: Partition): Promise<Cluster[]> {
	const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
	const membersByCluster = new Map<string, GraphNode[]>()
	for (const [nodeId, clusterId] of partition.byNode) {
		const node = nodeById.get(nodeId)
		if (!node) continue
		const bucket = membersByCluster.get(clusterId) ?? []
		bucket.push(node)
		membersByCluster.set(clusterId, bucket)
	}

	const labelled = new Map<string, Cluster>()
	await runWithConcurrency(partition.clusterIds, LABEL_CONCURRENCY, async (clusterId) => {
		labelled.set(clusterId, await labelOne(clusterId, membersByCluster.get(clusterId) ?? []))
	})

	// Preserve partition order; filtering (rather than `!`) keeps the types honest.
	return partition.clusterIds
		.map((clusterId) => labelled.get(clusterId))
		.filter((cluster): cluster is Cluster => cluster !== undefined)
}

async function labelOne(clusterId: string, members: readonly GraphNode[]): Promise<Cluster> {
	try {
		const result = await labelCluster(buildLabelInput(members))
		return {
			id: clusterId,
			label: result.content.label,
			description: result.content.description
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		console.warn(`[cluster] ${clusterId}: label failed (continuing): ${message}`)
		return { id: clusterId, label: fallbackLabel(members) }
	}
}

function buildLabelInput(members: readonly GraphNode[]): ClusterLabelInput {
	const shown = members.slice(0, MAX_MEMBERS_SHOWN).map((node) => ({
		path: node.path,
		classification: node.classification,
		summary: node.description?.what
	}))
	return { totalCount: members.length, members: shown }
}

function buildClusterLabelUserPrompt(input: ClusterLabelInput): string {
	const lines = input.members.map((member) => {
		const role = member.classification ?? "unclassified"
		const summary = member.summary ?? "(no summary)"
		return `- ${member.path} [${role}]: ${summary}`
	})
	const more =
		input.totalCount > input.members.length
			? `\n…and ${input.totalCount - input.members.length} more file(s).`
			: ""
	return `These ${input.totalCount} file(s) were grouped into one subsystem by community detection:\n${lines.join("\n")}${more}`
}

/**
 * Name a cluster from its files when the LLM call fails — the directory most of
 * its members share, which is usually a decent proxy for the subsystem.
 */
function fallbackLabel(members: readonly GraphNode[]): string {
	const counts = new Map<string, number>()
	for (const node of members) {
		const dir = posix.dirname(node.path)
		const name = dir === "." || dir === "" ? node.label : posix.basename(dir)
		counts.set(name, (counts.get(name) ?? 0) + 1)
	}
	let best = "Untitled cluster"
	let bestCount = 0
	for (const [name, count] of counts) {
		if (count > bestCount) {
			best = name
			bestCount = count
		}
	}
	return best
}
