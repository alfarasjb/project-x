import { eq } from "drizzle-orm"
import { observe, updateActiveObservation } from "@langfuse/tracing"
import {
	GraphSchema,
	type Description,
	type Graph,
	type GraphNode,
	type NodeClassification
} from "@shared/schemas/graph"
import { IssuesSchema, type Issue } from "@shared/schemas/issue"
import type { CrawlResponse } from "@shared/schemas/crawl"
import type { Project } from "@shared/schemas/project"
import { getDb } from "@server/db"
import { projects } from "@server/db/schema/projects"
import { parseProject } from "@server/parser"
import { analyzeGraph } from "@server/audit/analyze"
import { runAudit, runSimilarityAudit, mergeIssueHistory } from "@server/audit/run"
import { embedNodes } from "@server/domain/embeddings"
import { dispatchCrawlGithub } from "@server/domain/crawl-dispatch"
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
				...(prev.classification !== undefined ? { classification: prev.classification } : {}),
				...(prev.analyzedHash !== undefined ? { analyzedHash: prev.analyzedHash } : {}),
				...(prev.concerns !== undefined ? { concerns: prev.concerns } : {})
			}
		})
	}
}

/**
 * Crawl a project — entry point for both code paths. Two modes:
 *
 *   - Local (`rootPath`) — Fastify runs the parse + audit inline against the
 *     local filesystem and returns the fresh graph in the same request.
 *   - GitHub (`repoUrl`) — dispatch a Trigger.dev task that clones, parses,
 *     and persists on a worker. Returns a runId immediately; the UI polls
 *     `GET /api/crawl-runs/:runId` to discover completion, then refetches
 *     the graph from the DB.
 *
 * One of `rootPath` / `repoUrl` is always set on a project (DB constraint
 * is loose, but `createProject` enforces it). Neither = real bug, 409.
 *
 * Crawl is non-destructive for agent-written data and deterministic — see
 * `crawlProjectFromPath` for the inner loop.
 */
export async function crawlProject(project: Project, userId: string): Promise<CrawlResponse> {
	if (project.repoUrl) {
		const { runId } = await dispatchCrawlGithub(project, userId)
		return { kind: "queued", runId }
	}
	if (!project.rootPath) {
		throw new AppError(
			409,
			`Project "${project.slug}" has neither a local path nor a GitHub URL — can't crawl.`
		)
	}
	const graph = await crawlProjectFromPath(project, project.rootPath)
	return { kind: "completed", graph }
}

/**
 * The "parse, audit, persist" inner loop, parameterized by where the
 * source lives on disk. Called inline by the local-crawl path and by the
 * Trigger.dev crawl-github task after it extracts the tarball.
 *
 * Crawl is non-destructive for agent-written data: descriptions and
 * classifications from the previous graph are carried over onto matching
 * nodes by path. The audit's `firstDetected` timestamps are similarly
 * preserved per-issue id, so "this circular dependency has existed since
 * the 2026-05-15 crawl" survives the next crawl.
 *
 * Crawl is deterministic and free — it never calls an LLM. The AI enrichment
 * (classification + description) is the separate, user-triggered Analyze
 * action; see `analyzeProject`.
 */
export async function crawlProjectFromPath(project: Project, sourcePath: string): Promise<Graph> {
	const fresh = await parseProject(sourcePath)
	const previous = await getProjectGraph(project.id)
	const previousIssues = await getProjectIssues(project.id)
	const merged = previous ? mergePreservedFields(fresh, previous.actual) : fresh
	// Duplicate-candidates are computed only at Analyze time (they need the
	// pgvector index, which the cheap+fast crawl doesn't refresh). Carry the
	// last analyze's findings forward so a crawl-without-analyze doesn't
	// wipe them from the feed.
	const carriedDuplicates = previousIssues.filter(
		(issue) => issue.category === "duplicate-candidates"
	)
	const issues = mergeIssueHistory([...runAudit(merged), ...carriedDuplicates], previousIssues)
	await saveActualGraph(project.id, merged)
	await saveProjectIssues(project.id, issues)
	return merged
}

/**
 * Run the AI enrichment pass over a project's stored graph: classify and
 * describe every file/module that doesn't already have both. Re-runs the
 * heuristic audit afterwards (today the rules don't read classifications,
 * but the next audit PR will — running it now keeps the contract simple:
 * Analyze always leaves the issues consistent with the graph).
 *
 * Separate from crawl because it costs money (per-token API calls) and
 * requires `ANTHROPIC_API_KEY`. The route handler maps a missing key to a
 * 4xx; per-node failures inside the pass are logged and the rest of the
 * graph still saves, so partial-analyze is a recoverable state.
 */
export async function analyzeProject(
	project: Project,
	options?: { force?: boolean }
): Promise<{ graph: Graph; analyzed: number; skipped: number; failed: number }> {
	// Root trace for the whole analyze run. Every per-node call inside
	// `analyzeGraph` nests under this as `analyze-node <path>`, and each
	// LLM attempt nests one level deeper as a generation span — so a
	// single Langfuse trace shows the full project → node → generation
	// hierarchy with rolled-up cost + token totals.
	const traced = observe(
		async () => {
			const stored = await getProjectGraph(project.id)
			const current = stored?.actual ?? null
			if (!current || current.nodes.length === 0) {
				throw new AppError(409, `Project "${project.slug}" has no graph — crawl it first.`)
			}
			updateActiveObservation({
				input: {
					project: project.slug,
					nodes: current.nodes.length,
					force: options?.force ?? false
				},
				metadata: {
					projectId: project.id,
					projectSlug: project.slug,
					organizationId: project.organizationId,
					force: options?.force ?? false
				}
			})
			if (!project.rootPath) {
				throw new AppError(
					409,
					`Project "${project.slug}" was imported from GitHub. Analyzing GitHub-imported repos is not yet supported on this server — coming in the next release.`
				)
			}
			const result = await analyzeGraph(current, project.rootPath, options)
			const previousIssues = await getProjectIssues(project.id)
			const heuristicIssues = runAudit(result.graph)
			await saveActualGraph(project.id, result.graph)
			// Embed AFTER the graph is saved + descriptions exist. No-ops when
			// VOYAGE_API_KEY is unset (same opt-in pattern as Anthropic).
			// Failures don't roll back the analyze run — embeddings are a
			// derived index, not source-of-truth state.
			const embedResult = await embedNodes(project.id, result.graph).catch((error: unknown) => {
				const message = error instanceof Error ? error.message : String(error)
				console.warn(`[analyze] ${project.slug}: embed step failed (continuing): ${message}`)
				return { embedded: 0, skipped: 0, failed: 0 }
			})
			// Similarity audit runs AFTER embed so the pgvector index it queries
			// is fresh for this run. No-op when no nodes are embedded (e.g.
			// VOYAGE_API_KEY unset, or first-ever analyze still in progress).
			// Failures don't roll back the analyze run — heuristic issues + the
			// saved graph are independently useful.
			const similarityIssues = await runSimilarityAudit(project.id, result.graph).catch(
				(error: unknown) => {
					const message = error instanceof Error ? error.message : String(error)
					console.warn(
						`[analyze] ${project.slug}: similarity audit failed (continuing): ${message}`
					)
					return [] as Issue[]
				}
			)
			const issues = mergeIssueHistory([...heuristicIssues, ...similarityIssues], previousIssues)
			await saveProjectIssues(project.id, issues)
			console.warn(
				`[analyze] ${project.slug}: analyzed ${result.analyzed}, skipped ${result.skipped}, failed ${result.failed}, embedded ${embedResult.embedded} (embed skipped ${embedResult.skipped}, failed ${embedResult.failed}), duplicate-candidates ${similarityIssues.length}${options?.force ? " (forced)" : ""}`
			)
			updateActiveObservation({
				output: {
					analyzed: result.analyzed,
					skipped: result.skipped,
					failed: result.failed,
					embedded: embedResult.embedded
				}
			})
			return result
		},
		{ name: `analyze-project ${project.slug}`, asType: "span" }
	)
	return traced()
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
