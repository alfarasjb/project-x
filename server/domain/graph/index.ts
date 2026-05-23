import { eq } from "drizzle-orm"
import {
	GraphSchema,
	type Description,
	type Graph,
	type GraphNode,
	type NodeClassification
} from "@shared/schemas/graph"
import { IssuesSchema, type Issue } from "@shared/schemas/issue"
import type { Project } from "@shared/schemas/project"
import { getDb } from "@server/db"
import { projects } from "@server/db/schema/projects"
import { parseProject } from "@server/parser"
import { runAudit, mergeIssueHistory } from "@server/audit/run"
import { AppError } from "@server/utils/errors"

/**
 * Read both halves of a project's graph (intent + actual).
 * Returns null if the project doesn't exist.
 */
export async function getProjectGraph(
	projectId: string
): Promise<{ intent: Graph; actual: Graph } | null> {
	const db = getDb()
	const [row] = await db
		.select({ intentGraph: projects.intentGraph, actualGraph: projects.actualGraph })
		.from(projects)
		.where(eq(projects.id, projectId))
		.limit(1)
	if (!row) return null
	return {
		intent: GraphSchema.parse(row.intentGraph),
		actual: GraphSchema.parse(row.actualGraph)
	}
}

export async function saveIntentGraph(projectId: string, graph: Graph): Promise<void> {
	const db = getDb()
	const validated = GraphSchema.parse(graph)
	await db
		.update(projects)
		.set({ intentGraph: validated, updatedAt: new Date().toISOString() })
		.where(eq(projects.id, projectId))
}

export async function saveActualGraph(projectId: string, graph: Graph): Promise<void> {
	const db = getDb()
	const validated = GraphSchema.parse(graph)
	const now = new Date().toISOString()
	await db
		.update(projects)
		.set({ actualGraph: validated, lastParsedAt: now, updatedAt: now })
		.where(eq(projects.id, projectId))
}

/**
 * Read the audit issues stored on a project. Returns an empty array for a
 * project that hasn't been crawled yet (the column defaults to `[]`).
 */
export async function getProjectIssues(projectId: string): Promise<Issue[]> {
	const db = getDb()
	const [row] = await db
		.select({ crawlIssues: projects.crawlIssues })
		.from(projects)
		.where(eq(projects.id, projectId))
		.limit(1)
	if (!row) return []
	return IssuesSchema.parse(row.crawlIssues)
}

/**
 * Persist the audit's findings as a JSONB array on the project row. Called
 * by `crawlProject` after `runAudit`; not exposed as a route since issues
 * are derived, not user-edited.
 */
async function saveProjectIssues(projectId: string, issues: Issue[]): Promise<void> {
	const db = getDb()
	const validated = IssuesSchema.parse(issues)
	await db
		.update(projects)
		.set({ crawlIssues: validated, updatedAt: new Date().toISOString() })
		.where(eq(projects.id, projectId))
}

/**
 * Carry agent-set fields (`description`, `classification`) from the previous
 * stored graph onto a freshly-parsed one, matching nodes by `path`. The
 * parser doesn't know about anything the user or an agent wrote — without
 * this merge, every re-crawl would wipe it.
 *
 * Identity is `path`, not `id`: ids are regenerated each parse, paths are
 * the stable thing a file/module/symbol has across crawls.
 */
function mergePreservedFields(fresh: Graph, previous: Graph): Graph {
	const previousByPath = new Map(previous.nodes.map((node) => [node.path, node]))
	return {
		...fresh,
		nodes: fresh.nodes.map((node) => {
			const prev = previousByPath.get(node.path)
			if (!prev) return node
			return {
				...node,
				...(prev.description !== undefined ? { description: prev.description } : {}),
				...(prev.classification !== undefined ? { classification: prev.classification } : {})
			}
		})
	}
}

/**
 * Crawl a project: re-parse its codebase, run the audit pass, and persist
 * both. This is the "Crawl" action — the one operation that refreshes the
 * parsed graph. Reads (`getProjectGraph`, `getProjectIssues`) only ever
 * return what a crawl wrote.
 *
 * Crawl is non-destructive for agent-written data: descriptions and
 * classifications from the previous graph are carried over onto matching
 * nodes by path. The audit's `firstDetected` timestamps are similarly
 * preserved per-issue id, so "this circular dependency has existed since
 * the 2026-05-15 crawl" survives the next crawl.
 */
export async function crawlProject(project: Project): Promise<Graph> {
	const fresh = await parseProject(project.rootPath)
	const previous = await getProjectGraph(project.id)
	const previousIssues = await getProjectIssues(project.id)
	const merged = previous ? mergePreservedFields(fresh, previous.actual) : fresh
	const issues = mergeIssueHistory(runAudit(merged), previousIssues)
	await saveActualGraph(project.id, merged)
	await saveProjectIssues(project.id, issues)
	return merged
}

/**
 * Set one node's description in the stored actual graph. The graph is a JSONB
 * blob with no per-node update, so this reads the whole graph, mutates the one
 * node, and writes it back.
 *
 * Throws if the project or node is unknown. Refuses to overwrite a node whose
 * description was authored by a human (`source: "manual"`) unless `overwrite`
 * is set — agent-written descriptions never silently clobber hand-written ones.
 */
export async function setNodeDescription(
	projectId: string,
	nodeId: string,
	description: Description,
	opts?: { overwrite?: boolean }
): Promise<GraphNode> {
	const graph = await getProjectGraph(projectId)
	if (!graph) throw new AppError(404, `Project not found: ${projectId}`)

	const node = graph.actual.nodes.find((candidate) => candidate.id === nodeId)
	if (!node) throw new AppError(404, `No node "${nodeId}" in the actual graph.`)

	if (node.description?.source === "manual" && !opts?.overwrite) {
		throw new AppError(
			409,
			`Node "${nodeId}" has a manual description — pass overwrite to replace it.`
		)
	}

	node.description = description
	await saveActualGraph(projectId, graph.actual)
	return node
}

/**
 * Set one node's classification (business-logic / routing / data-access /
 * etc.) in the stored actual graph. Like `setNodeDescription`, this reads
 * the whole JSONB blob, mutates the one node, and writes it back — fine at
 * MVP scale; revisit if the audit pipeline starts firing many writes per
 * second.
 *
 * Throws if the project or node is unknown. No overwrite guard: classifications
 * have no "manual vs ai" provenance and the most recent guess wins.
 */
export async function setNodeClassification(
	projectId: string,
	nodeId: string,
	classification: NodeClassification
): Promise<GraphNode> {
	const graph = await getProjectGraph(projectId)
	if (!graph) throw new AppError(404, `Project not found: ${projectId}`)

	const node = graph.actual.nodes.find((candidate) => candidate.id === nodeId)
	if (!node) throw new AppError(404, `No node "${nodeId}" in the actual graph.`)

	node.classification = classification
	await saveActualGraph(projectId, graph.actual)
	return node
}

/** A node plus its immediate graph context — containment and edges. */
export interface NodeDetail {
	node: GraphNode
	/** Containment parent, or null at the top level. */
	parent: GraphNode | null
	/** Nodes contained directly inside this one. */
	children: GraphNode[]
	/** Nodes this node depends on — the targets of its outgoing edges. */
	dependencies: GraphNode[]
	/** Nodes that depend on this one — the sources of its incoming edges. */
	dependents: GraphNode[]
}

/**
 * Resolve one node's detail in the stored actual graph: the node itself plus
 * its containment parent/children and its edge neighbours. This is the unit an
 * agent walks to trace a flow — follow `dependencies` to the next node, repeat.
 *
 * Throws if the project or node is unknown.
 */
export async function getNodeDetail(projectId: string, nodeId: string): Promise<NodeDetail> {
	const graph = await getProjectGraph(projectId)
	if (!graph) throw new AppError(404, `Project not found: ${projectId}`)

	const { nodes, edges } = graph.actual
	const byId = new Map(nodes.map((node) => [node.id, node]))
	const node = byId.get(nodeId)
	if (!node) throw new AppError(404, `No node "${nodeId}" in the actual graph.`)

	const resolve = (id: string | undefined): GraphNode | undefined =>
		id === undefined ? undefined : byId.get(id)
	const present = (candidate: GraphNode | undefined): candidate is GraphNode =>
		candidate !== undefined

	return {
		node,
		parent: resolve(node.parentId ?? undefined) ?? null,
		children: nodes.filter((candidate) => candidate.parentId === nodeId),
		dependencies: edges
			.filter((edge) => edge.source === nodeId)
			.map((edge) => resolve(edge.target))
			.filter(present),
		dependents: edges
			.filter((edge) => edge.target === nodeId)
			.map((edge) => resolve(edge.source))
			.filter(present)
	}
}
