import { sql } from "drizzle-orm"
import { jsonb, text, uniqueIndex, uuid } from "drizzle-orm/pg-core"
import type { Graph } from "@shared/schemas/graph"
import { schema, timestamp, timestampConfig, timestamps } from "@server/db/schema/common"

/**
 * Project — one architecture being modeled.
 *
 * The graph is the live diff between *intent* and *reality*:
 *   - intentGraph: the user's hand-edited architecture (ReactFlow canvas)
 *   - actualGraph: the parser's output (ts-morph over the codebase)
 *
 * Both columns are JSONB. Whole-graph reads/writes only for MVP — if per-node
 * queries become a hot path (e.g. archlens://module/{id} called constantly),
 * split into relational tables (see Patentext's inventionNodes/inventionEdges).
 */
export const projects = schema.table(
	"projects",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		slug: text("slug").notNull(),
		name: text("name").notNull(),
		rootPath: text("root_path").notNull(),
		intentGraph: jsonb("intent_graph")
			.$type<Graph>()
			.notNull()
			.default(sql`'{"nodes":[],"edges":[]}'::jsonb`),
		actualGraph: jsonb("actual_graph")
			.$type<Graph>()
			.notNull()
			.default(sql`'{"nodes":[],"edges":[]}'::jsonb`),
		lastParsedAt: timestamp("last_parsed_at", timestampConfig),
		createdAt: timestamps.createdAt,
		updatedAt: timestamps.updatedAt,
		archivedAt: timestamps.archivedAt
	},
	(table) => [uniqueIndex("projects_slug_unique_idx").on(table.slug)]
)

export type Project = typeof projects.$inferSelect
export type NewProject = typeof projects.$inferInsert
