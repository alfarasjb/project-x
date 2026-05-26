import { statSync } from "node:fs"
import { resolve } from "node:path"
import { and, desc, eq, isNotNull, isNull, like, or } from "drizzle-orm"
import { z } from "zod"
import type { CreateProject, Project } from "@shared/schemas/project"
import { AppError } from "@server/utils/errors"
import { getDb } from "@server/db"
import { projects } from "@server/db/schema/projects"

/**
 * Project domain — CRUD for the repos the app tracks.
 *
 * Projects are org-owned: every read/write below takes an `organizationId` so
 * a project from another org is never visible. `getProject` is the one
 * unscoped helper, used by the MCP server (which binds to a project by id /
 * slug at startup, has no session, and trusts its own resolution).
 *
 * A project is bound to a local filesystem `rootPath`; the parser crawls
 * that path. Removal is a soft archive (`archivedAt`), never a hard delete.
 */

/** Columns the API exposes — the summary shape, without the heavy graph JSONB. */
const projectColumns = {
	id: projects.id,
	organizationId: projects.organizationId,
	slug: projects.slug,
	name: projects.name,
	rootPath: projects.rootPath,
	repoUrl: projects.repoUrl,
	lastParsedAt: projects.lastParsedAt,
	archivedAt: projects.archivedAt,
	createdAt: projects.createdAt,
	updatedAt: projects.updatedAt
}

const uuid = z.uuid()

/** List the org's projects — active by default, archived ones when `archived` is set. */
export async function listProjects(opts: {
	organizationId: string
	archived?: boolean
}): Promise<Project[]> {
	const db = getDb()
	const archivedFilter = opts.archived
		? isNotNull(projects.archivedAt)
		: isNull(projects.archivedAt)
	return db
		.select(projectColumns)
		.from(projects)
		.where(and(eq(projects.organizationId, opts.organizationId), archivedFilter))
		.orderBy(desc(projects.createdAt))
}

/**
 * Fetch one project by id, unscoped. Returns null for an unknown or
 * malformed id. **Don't use from request handlers** — call
 * `getProjectForOrg` instead so cross-org access returns 404. The MCP server
 * uses this directly because it binds to a project outside any session.
 */
export async function getProject(id: string): Promise<Project | null> {
	if (!uuid.safeParse(id).success) return null
	const db = getDb()
	const [project] = await db
		.select(projectColumns)
		.from(projects)
		.where(eq(projects.id, id))
		.limit(1)
	return project ?? null
}

/**
 * Org-scoped project lookup for request handlers. Returns null when the id
 * is unknown OR belongs to another org — same shape either way so the client
 * can't probe ids across tenants.
 */
export async function getProjectForOrg(
	id: string,
	organizationId: string
): Promise<Project | null> {
	const project = await getProject(id)
	if (!project) return null
	if (project.organizationId !== organizationId) return null
	return project
}

/**
 * Fetch one project by slug within an org. Slugs are unique per-org, not
 * globally, so the org is required. Used by the MCP server (which passes a
 * resolved org id) and any slug-based route.
 */
export async function getProjectBySlug(
	slug: string,
	organizationId: string
): Promise<Project | null> {
	const db = getDb()
	const [project] = await db
		.select(projectColumns)
		.from(projects)
		.where(and(eq(projects.slug, slug), eq(projects.organizationId, organizationId)))
		.limit(1)
	return project ?? null
}

/**
 * Create a project for an org. Two sources:
 *
 *   - `source: "local"` — a filesystem path. Resolved to absolute and verified
 *     to be a directory. A bad path is a 400, not a late crawl failure.
 *   - `source: "github"` — a GitHub clone URL. Trusted at create time (no
 *     network call); the crawler validates it later when it tries to clone.
 *
 * Exactly one of `rootPath` / `repoUrl` is set on the resulting row.
 */
export async function createProject(
	input: CreateProject,
	organizationId: string
): Promise<Project> {
	const db = getDb()
	const slug = await uniqueSlug(input.name, organizationId)
	const values =
		input.source === "local"
			? { name: input.name, slug, organizationId, rootPath: resolveRepoPath(input.rootPath) }
			: { name: input.name, slug, organizationId, repoUrl: input.repoUrl }
	const [project] = await db.insert(projects).values(values).returning(projectColumns)
	if (!project) {
		throw new AppError(500, "createProject: insert returned no row")
	}
	return project
}

/**
 * Rename a project — updates `name` only; the `slug` stays stable so URLs
 * and the MCP `PROJECT_X_PROJECT` binding don't break on rename. Returns
 * the updated row, or null when the id is unknown / belongs to another org.
 */
// [JB]: Note: Later we will change this to UpdateProject instead of just rename. should take a json payload and is called when user hits "Save"
export async function renameProject(
	id: string,
	organizationId: string,
	name: string
): Promise<Project | null> {
	if (!uuid.safeParse(id).success) return null
	const db = getDb()
	const [project] = await db
		.update(projects)
		.set({ name, updatedAt: new Date().toISOString() })
		.where(and(eq(projects.id, id), eq(projects.organizationId, organizationId)))
		.returning(projectColumns)
	return project ?? null
}

/** Soft-delete within an org: mark the project archived. Null for unknown / wrong-org id. */
export async function archiveProject(id: string, organizationId: string): Promise<Project | null> {
	if (!uuid.safeParse(id).success) return null
	const db = getDb()
	const now = new Date().toISOString()
	const [project] = await db
		.update(projects)
		.set({ archivedAt: now, updatedAt: now })
		.where(and(eq(projects.id, id), eq(projects.organizationId, organizationId)))
		.returning(projectColumns)
	return project ?? null
}

/** Reverse an archive — clears `archivedAt`. Null for unknown / wrong-org id. */
export async function unarchiveProject(
	id: string,
	organizationId: string
): Promise<Project | null> {
	if (!uuid.safeParse(id).success) return null
	const db = getDb()
	const [project] = await db
		.update(projects)
		.set({ archivedAt: null, updatedAt: new Date().toISOString() })
		.where(and(eq(projects.id, id), eq(projects.organizationId, organizationId)))
		.returning(projectColumns)
	return project ?? null
}

/** Resolve a user-supplied path to an absolute one and verify it's a directory. */
function resolveRepoPath(input: string): string {
	const rootPath = resolve(input)
	try {
		if (!statSync(rootPath).isDirectory()) {
			throw new AppError(400, `Not a directory: ${rootPath}`)
		}
	} catch (cause) {
		if (cause instanceof AppError) throw cause
		throw new AppError(400, `No such directory: ${rootPath}`, { cause })
	}
	return rootPath
}

/**
 * Unscoped helpers — for system contexts (the MCP server) that bind to a
 * project outside any session. Never call from request handlers.
 */

/** List every project across every org. Used by the MCP server's cwd match. */
export async function listAllProjects(): Promise<Project[]> {
	const db = getDb()
	return db
		.select(projectColumns)
		.from(projects)
		.where(isNull(projects.archivedAt))
		.orderBy(desc(projects.createdAt))
}

/**
 * Find a project by slug across all orgs. Returns the first match — slugs
 * are now unique per-org, so if two orgs have the same slug the result is
 * ambiguous and the caller should disambiguate by id instead.
 */
export async function findAnyProjectBySlug(slug: string): Promise<Project | null> {
	const db = getDb()
	const [project] = await db
		.select(projectColumns)
		.from(projects)
		.where(eq(projects.slug, slug))
		.limit(1)
	return project ?? null
}

/** Slugify a name; append `-2`, `-3`… until the slug is unique within the org. */
async function uniqueSlug(name: string, organizationId: string): Promise<string> {
	const base =
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || "project"
	const db = getDb()
	const rows = await db
		.select({ slug: projects.slug })
		.from(projects)
		.where(
			and(
				eq(projects.organizationId, organizationId),
				or(eq(projects.slug, base), like(projects.slug, `${base}-%`))
			)
		)
	const taken = new Set(rows.map((row) => row.slug))
	if (!taken.has(base)) return base
	let n = 2
	while (taken.has(`${base}-${n}`)) n += 1
	return `${base}-${n}`
}
