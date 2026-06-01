import { and, asc, eq, like, or, sql } from "drizzle-orm"
import { z } from "zod"
import type {
	CreateFeatureFlow,
	FeatureFlow,
	FeatureFlowSummary
} from "@shared/schemas/feature-flow"
import { AppError } from "@server/utils/errors"
import { getDb } from "@server/db"
import { featureFlows } from "@server/db/schema/feature-flows"
import { getProject, getProjectForOrg } from "@server/domain/project"

/**
 * Feature flow domain — CRUD for a project's saved per-feature views.
 *
 * Flows are project-owned, and projects are org-owned, so every request-facing
 * call verifies the project belongs to the caller's org first (via
 * `getProjectForOrg`) — a flow under another org's project is never visible.
 * A missing-or-wrong-org project surfaces as 404 at the route, same contract
 * as the project endpoints.
 *
 * The write path (`createFeatureFlow`) is server-internal for now — the seed,
 * and later the ARG-11 agent. There's no manual-create REST route yet.
 */

const uuid = z.uuid()

/** Summary columns + graph cardinality, computed in SQL so the list never ships the graph blob. */
const summaryColumns = {
	id: featureFlows.id,
	projectId: featureFlows.projectId,
	slug: featureFlows.slug,
	name: featureFlows.name,
	description: featureFlows.description,
	nodeCount: sql<number>`coalesce(jsonb_array_length(${featureFlows.graph} -> 'nodes'), 0)`.mapWith(
		Number
	),
	edgeCount: sql<number>`coalesce(jsonb_array_length(${featureFlows.graph} -> 'edges'), 0)`.mapWith(
		Number
	),
	createdAt: featureFlows.createdAt,
	updatedAt: featureFlows.updatedAt
}

/**
 * List a project's feature flows (summaries, no graph). Returns null when the
 * project is unknown or belongs to another org — the route turns that into a
 * 404 so project ids don't leak across tenants.
 */
export async function listFeatureFlows(
	projectId: string,
	organizationId: string
): Promise<FeatureFlowSummary[] | null> {
	const project = await getProjectForOrg(projectId, organizationId)
	if (!project) return null
	const db = getDb()
	return db
		.select(summaryColumns)
		.from(featureFlows)
		.where(eq(featureFlows.projectId, projectId))
		.orderBy(asc(featureFlows.name))
}

/**
 * Fetch one flow (with its graph) by project + slug. Null when the project is
 * unknown/cross-org OR the slug doesn't exist under it — the route maps either
 * to a 404.
 */
export async function getFeatureFlow(
	projectId: string,
	slug: string,
	organizationId: string
): Promise<FeatureFlow | null> {
	const project = await getProjectForOrg(projectId, organizationId)
	if (!project) return null
	const db = getDb()
	const [flow] = await db
		.select({ ...summaryColumns, graph: featureFlows.graph })
		.from(featureFlows)
		.where(and(eq(featureFlows.projectId, projectId), eq(featureFlows.slug, slug)))
		.limit(1)
	return flow ?? null
}

/**
 * Create a flow under a project. Org-scoped: throws 404 if the project is
 * unknown or cross-org. Slug is derived from the name when not supplied, then
 * made unique within the project.
 */
export async function createFeatureFlow(
	projectId: string,
	organizationId: string,
	input: CreateFeatureFlow
): Promise<FeatureFlow> {
	const project = await getProjectForOrg(projectId, organizationId)
	if (!project) throw new AppError(404, `Project not found: ${projectId}`)
	return insertFeatureFlow(projectId, input)
}

/**
 * Unscoped create — for system contexts (the seed) that resolve a project by
 * id outside any session. Never call from request handlers; use
 * `createFeatureFlow` so cross-org writes are rejected.
 */
export async function createFeatureFlowForProject(
	projectId: string,
	input: CreateFeatureFlow
): Promise<FeatureFlow> {
	if (!uuid.safeParse(projectId).success) {
		throw new AppError(400, `Invalid project id: ${projectId}`)
	}
	const project = await getProject(projectId)
	if (!project) throw new AppError(404, `Project not found: ${projectId}`)
	return insertFeatureFlow(projectId, input)
}

/** Shared insert path — slug resolution + insert + re-read as the detail shape. */
async function insertFeatureFlow(
	projectId: string,
	input: CreateFeatureFlow
): Promise<FeatureFlow> {
	const db = getDb()
	const slug = await uniqueSlug(projectId, input.slug ?? input.name)
	const [inserted] = await db
		.insert(featureFlows)
		.values({
			projectId,
			slug,
			name: input.name,
			description: input.description ?? null,
			graph: input.graph
		})
		.returning({ ...summaryColumns, graph: featureFlows.graph })
	if (!inserted) {
		throw new AppError(500, "createFeatureFlow: insert returned no row")
	}
	return inserted
}

/** Slugify; append `-2`, `-3`… until the slug is unique within the project. */
async function uniqueSlug(projectId: string, source: string): Promise<string> {
	const base =
		source
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || "flow"
	const db = getDb()
	const rows = await db
		.select({ slug: featureFlows.slug })
		.from(featureFlows)
		.where(
			and(
				eq(featureFlows.projectId, projectId),
				or(eq(featureFlows.slug, base), like(featureFlows.slug, `${base}-%`))
			)
		)
	const taken = new Set(rows.map((row) => row.slug))
	if (!taken.has(base)) return base
	let n = 2
	while (taken.has(`${base}-${n}`)) n += 1
	return `${base}-${n}`
}

/** True if a flow with `slug` already exists under the project — used by the idempotent seed. */
export async function featureFlowExists(projectId: string, slug: string): Promise<boolean> {
	const db = getDb()
	const [row] = await db
		.select({ id: featureFlows.id })
		.from(featureFlows)
		.where(and(eq(featureFlows.projectId, projectId), eq(featureFlows.slug, slug)))
		.limit(1)
	return row !== undefined
}
