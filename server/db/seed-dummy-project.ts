import { resolve } from "node:path"
import { and, eq } from "drizzle-orm"
import { getDb } from "@server/db"
import { organization } from "@server/db/schema/auth"
import { projects } from "@server/db/schema/projects"
import { createProject } from "@server/domain/project"

/**
 * Dev seed — points a project at the in-repo `evals/fixtures/dummy-project/`
 * fixture so a fresh test cycle (crawl + analyze + embed) runs in seconds
 * over ~7 files instead of crawling the whole monorepo.
 *
 * Applies to EVERY organization in the DB — each one gets its own
 * "Dummy Todo App" project. Idempotent per-org: skips any org that already
 * has a project with this slug. Safe to run repeatedly.
 *
 * Run with: `pnpm db:seed:dummy-project`
 */
const DUMMY_PROJECT_NAME = "Dummy Todo App"
const DUMMY_PROJECT_SLUG = "dummy-todo-app"
const FIXTURE_RELATIVE_PATH = "evals/fixtures/dummy-project"

async function main(): Promise<void> {
	const db = getDb()
	const orgs = await db.select({ id: organization.id, slug: organization.slug }).from(organization)
	if (orgs.length === 0) {
		console.error("[seed:dummy] No organizations found. Sign up via the web UI first, then re-run.")
		process.exit(1)
	}

	const rootPath = resolve(process.cwd(), FIXTURE_RELATIVE_PATH)
	let created = 0
	let skipped = 0

	for (const org of orgs) {
		const [dupe] = await db
			.select({ id: projects.id })
			.from(projects)
			.where(and(eq(projects.organizationId, org.id), eq(projects.slug, DUMMY_PROJECT_SLUG)))
			.limit(1)
		if (dupe) {
			console.warn(
				`[seed:dummy] skip — org "${org.slug}" already has "${DUMMY_PROJECT_SLUG}" (id=${dupe.id})`
			)
			skipped += 1
			continue
		}

		const project = await createProject({ name: DUMMY_PROJECT_NAME, rootPath }, org.id)
		console.warn(
			`[seed:dummy] created "${project.name}" (id=${project.id}) in org "${org.slug}" ` +
				`pointing at ${project.rootPath}`
		)
		created += 1
	}

	console.warn(
		`[seed:dummy] done — created ${created}, skipped ${skipped}, total orgs ${orgs.length}.\n` +
			`  → open any dashboard, hit Crawl, then Analyze to exercise the full AI pipeline.`
	)
}

await main()
process.exit(0)
