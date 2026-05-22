import { statSync } from "node:fs"
import { resolve } from "node:path"
import { desc, eq, isNotNull, isNull, like, or } from "drizzle-orm"
import { z } from "zod"
import type { CreateProject, Project } from "@shared/schemas/project"
import { AppError } from "@server/utils/errors"
import { getDb } from "@server/db"
import { projects } from "@server/db/schema/projects"

/**
 * Project domain — CRUD for the repos the app tracks. A project is bound to a
 * local filesystem `rootPath`; the parser crawls that path. Removal is a soft
 * archive (`archivedAt`), never a hard delete.
 */

/** Columns the API exposes — the summary shape, without the heavy graph JSONB. */
const projectColumns = {
	id: projects.id,
	slug: projects.slug,
	name: projects.name,
	rootPath: projects.rootPath,
	lastParsedAt: projects.lastParsedAt,
	archivedAt: projects.archivedAt,
	createdAt: projects.createdAt,
	updatedAt: projects.updatedAt
}

const uuid = z.uuid()

/** List projects — active by default, archived ones when `archived` is set. */
export async function listProjects(opts?: { archived?: boolean }): Promise<Project[]> {
	const db = getDb()
	const filter = opts?.archived ? isNotNull(projects.archivedAt) : isNull(projects.archivedAt)
	return db.select(projectColumns).from(projects).where(filter).orderBy(desc(projects.createdAt))
}

/** Fetch one project by id. Returns null for an unknown or malformed id. */
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

/** Fetch one project by slug. Returns null when no project has that slug. */
export async function getProjectBySlug(slug: string): Promise<Project | null> {
	const db = getDb()
	const [project] = await db
		.select(projectColumns)
		.from(projects)
		.where(eq(projects.slug, slug))
		.limit(1)
	return project ?? null
}

/**
 * Create a project. `rootPath` is resolved to an absolute path and verified to
 * be an existing directory — a bad path is a 400, not a late crawl failure.
 */
export async function createProject(input: CreateProject): Promise<Project> {
	const rootPath = resolveRepoPath(input.rootPath)
	const db = getDb()
	const slug = await uniqueSlug(input.name)
	const [project] = await db
		.insert(projects)
		.values({ name: input.name, slug, rootPath })
		.returning(projectColumns)
	if (!project) {
		throw new AppError(500, "createProject: insert returned no row")
	}
	return project
}

/** Soft-delete: mark the project archived. Returns null for an unknown id. */
export async function archiveProject(id: string): Promise<Project | null> {
	if (!uuid.safeParse(id).success) return null
	const db = getDb()
	const now = new Date().toISOString()
	const [project] = await db
		.update(projects)
		.set({ archivedAt: now, updatedAt: now })
		.where(eq(projects.id, id))
		.returning(projectColumns)
	return project ?? null
}

/** Reverse an archive — clears `archivedAt`. Returns null for an unknown id. */
export async function unarchiveProject(id: string): Promise<Project | null> {
	if (!uuid.safeParse(id).success) return null
	const db = getDb()
	const [project] = await db
		.update(projects)
		.set({ archivedAt: null, updatedAt: new Date().toISOString() })
		.where(eq(projects.id, id))
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

/** Slugify a name; append `-2`, `-3`… until the slug is unique. */
async function uniqueSlug(name: string): Promise<string> {
	const base =
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || "project"
	const db = getDb()
	const rows = await db
		.select({ slug: projects.slug })
		.from(projects)
		.where(or(eq(projects.slug, base), like(projects.slug, `${base}-%`)))
	const taken = new Set(rows.map((row) => row.slug))
	if (!taken.has(base)) return base
	let n = 2
	while (taken.has(`${base}-${n}`)) n += 1
	return `${base}-${n}`
}
