import { resolve } from "node:path"
import type { Project } from "@shared/schemas/project"
import { env } from "@server/env"
import { findAnyProjectBySlug, getProject, listAllProjects } from "@server/domain/project"

/**
 * Resolve the single project this MCP server serves. The server binds to one
 * project for the whole session, so no tool needs a project argument.
 *
 * MCP runs outside any HTTP session — it has no authenticated user or active
 * org — so it deliberately uses the unscoped `listAllProjects` /
 * `findAnyProjectBySlug` helpers. Slugs are unique per-org, so a slug hint
 * matches the first project that owns it; pass a uuid in `PROJECT_X_PROJECT`
 * to disambiguate when two orgs share a slug.
 *
 * Resolution order:
 *   1. `PROJECT_X_PROJECT` env var — a project id (uuid) or slug.
 *   2. A project whose `rootPath` is the current working directory — i.e. the
 *      server was launched from inside the repo it should serve.
 *   3. The sole project, when exactly one exists.
 *
 * Throws with an actionable message when none of these resolve.
 */
export async function resolveBoundProject(): Promise<Project> {
	const hint = env.PROJECT_X_PROJECT
	if (hint) {
		const byId = await getProject(hint)
		if (byId) return byId
		const bySlug = await findAnyProjectBySlug(hint)
		if (bySlug) return bySlug
		throw new Error(`PROJECT_X_PROJECT="${hint}" matches no project (tried as id and slug).`)
	}

	const projects = await listAllProjects()

	const cwd = resolve(process.cwd())
	const byCwd = projects.find(
		(project) => project.rootPath !== null && resolve(project.rootPath) === cwd
	)
	if (byCwd) return byCwd

	const [only] = projects
	if (projects.length === 1 && only) return only

	throw new Error(
		projects.length === 0
			? "No projects exist. Create one and crawl it before starting the MCP server."
			: `Cannot pick a project: ${projects.length} exist and none matches the cwd. ` +
					`Set PROJECT_X_PROJECT to an id or slug — available slugs: ${projects
						.map((project) => project.slug)
						.join(", ")}.`
	)
}
