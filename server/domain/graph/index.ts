import { eq } from "drizzle-orm"
import { GraphSchema, type Graph } from "@shared/schemas/graph"
import type { Project } from "@shared/schemas/project"
import { getDb } from "@server/db"
import { projects } from "@server/db/schema/projects"
import { parseProject } from "@server/parser"

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
 * Crawl a project: re-parse its codebase and persist the result as the actual
 * graph. This is the "Crawl" action — the one operation that refreshes the
 * parsed graph. Reads (`getProjectGraph`) only ever return what a crawl wrote.
 */
export async function crawlProject(project: Project): Promise<Graph> {
	const graph = await parseProject(project.rootPath)
	await saveActualGraph(project.id, graph)
	return graph
}
