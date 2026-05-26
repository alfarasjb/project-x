import { sql } from "drizzle-orm"
import { jsonb, text, uniqueIndex, uuid } from "drizzle-orm/pg-core"
import type { Graph } from "@shared/schemas/graph"
import type { Issue } from "@shared/schemas/issue"
import { schema, timestamp, timestampConfig, timestamps } from "@server/db/schema/common"
import { organization } from "@server/db/schema/auth"

/**
 * Project — one architecture being modeled, owned by one organization.
 *
 * The graph is the live diff between *intent* and *reality*:
 *   - intentGraph: the user's hand-edited architecture (ReactFlow canvas)
 *   - actualGraph: the parser's output (ts-morph over the codebase)
 *
 * Both columns are JSONB. Whole-graph reads/writes only for MVP — if per-node
 * queries become a hot path (e.g. archlens://module/{id} called constantly),
 * split into relational tables (see Patentext's inventionNodes/inventionEdges).
 *
 * `slug` is unique per-org, not globally — two orgs can each have a "frontend"
 * project. The FK to `public.organization` is cross-schema; Postgres handles
 * this natively.
 */
export const projects = schema.table(
	"projects",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		slug: text("slug").notNull(),
		name: text("name").notNull(),
		/**
		 * Absolute path to a local repository directory. Legacy/dogfood path —
		 * present on projects created before the GitHub-import flow shipped.
		 * New projects imported from GitHub have `repoUrl` set instead and leave
		 * this null. Exactly one of `rootPath` / `repoUrl` must be set, enforced
		 * at the domain / schema layer (not the DB) so we can evolve the rule
		 * without a migration.
		 */
		rootPath: text("root_path"),
		/**
		 * GitHub clone URL for projects imported from GitHub (e.g.
		 * `https://github.com/owner/repo`). The crawler will shallow-clone this
		 * at crawl time using the user's stored OAuth token. Mutually exclusive
		 * with `rootPath` — see comment there.
		 */
		repoUrl: text("repo_url"),
		intentGraph: jsonb("intent_graph")
			.$type<Graph>()
			.notNull()
			.default(sql`'{"nodes":[],"edges":[]}'::jsonb`),
		actualGraph: jsonb("actual_graph")
			.$type<Graph>()
			.notNull()
			.default(sql`'{"nodes":[],"edges":[]}'::jsonb`),
		/**
		 * Audit findings from the most recent crawl. Written by `runAudit` and
		 * carried over (preserving `firstDetected`) across crawls.
		 */
		crawlIssues: jsonb("crawl_issues")
			.$type<Issue[]>()
			.notNull()
			.default(sql`'[]'::jsonb`),
		lastParsedAt: timestamp("last_parsed_at", timestampConfig),
		createdAt: timestamps.createdAt,
		updatedAt: timestamps.updatedAt,
		archivedAt: timestamps.archivedAt
	},
	(table) => [uniqueIndex("projects_org_slug_unique_idx").on(table.organizationId, table.slug)]
)

export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
