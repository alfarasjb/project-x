import { basename } from "node:path"
import { getDb } from "@server/db"
import { projects, type Project } from "@server/db/schema/projects"

/**
 * Tenancy resolution — the seam between an incoming request and the org /
 * project it acts on.
 *
 * Multi-tenancy (orgs, users, auth, membership) is deliberately deferred until
 * the core product is stable. Until then these resolvers "pass" unconditionally
 * and return the single local default. When auth lands, only the bodies here
 * change — the real versions read the session and verify access, and every
 * call site keeps working unchanged.
 */

/** Placeholder org id. There is no `orgs` table yet — this is just a constant. */
export const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001"

/** Slug of the single local project row — its stable identity across upserts. */
const DEFAULT_PROJECT_SLUG = "local"

/**
 * Resolve the current org.
 *
 * STUB: always returns the default org id. The real implementation will read
 * the authenticated session and verify membership. Not yet consumed anywhere —
 * it exists so the first org-scoped feature has a seam to plug into.
 */
export function ensureDefaultOrg(): string {
	return DEFAULT_ORG_ID
}

/**
 * Resolve the current project, creating it on first call.
 *
 * Idempotent: keyed by a constant slug, so repeated calls converge on one row
 * (the `onConflict` clause makes a concurrent double-insert safe). `rootPath`
 * is the directory the server runs in — the codebase the parser crawls — and
 * is refreshed on every call in case the repo moved.
 */
export async function ensureDefaultProject(): Promise<Project> {
	const db = getDb()
	const rootPath = process.cwd()
	const [project] = await db
		.insert(projects)
		.values({ slug: DEFAULT_PROJECT_SLUG, name: basename(rootPath), rootPath })
		.onConflictDoUpdate({ target: projects.slug, set: { rootPath } })
		.returning()
	if (!project) {
		throw new Error("ensureDefaultProject: upsert returned no row")
	}
	return project
}
