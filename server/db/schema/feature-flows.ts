import { sql } from "drizzle-orm"
import { jsonb, text, uniqueIndex, uuid } from "drizzle-orm/pg-core"
import type { Graph } from "@shared/schemas/graph"
import { schema, timestamps } from "@server/db/schema/common"
import { projects } from "@server/db/schema/projects"

/**
 * Feature flow — a saved, AI-derived per-feature view of a project's graph.
 *
 * A project has many flows; each is a self-contained `{ nodes, edges }` Graph
 * (same `GraphSchema` the parsed graph uses), NOT a list of ids into the parsed
 * graph. That's deliberate: a flow is the *sketch* side of the intent-vs-actual
 * diff, so it must be able to carry `intent` nodes that don't exist in the code
 * yet. Each node anchors back to reality by its `path`; the drift derivation
 * (ARG-11) diffs the sketch against `projects.actual_graph`.
 *
 * `slug` is unique per-project (not globally) and is what the canvas URL
 * resolves against — stable across renames, same contract as `projects.slug`.
 *
 * Cascade on project delete: flows are derived/cheap, so unlike the soft-archive
 * on `projects`, a (future) hard project delete sweeps its flows.
 */
export const featureFlows = schema.table(
	"feature_flows",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		projectId: uuid("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		slug: text("slug").notNull(),
		name: text("name").notNull(),
		/** Short subtitle shown on the list card. Optional. */
		description: text("description"),
		graph: jsonb("graph")
			.$type<Graph>()
			.notNull()
			.default(sql`'{"nodes":[],"edges":[]}'::jsonb`),
		createdAt: timestamps.createdAt,
		updatedAt: timestamps.updatedAt
	},
	(table) => [uniqueIndex("feature_flows_project_slug_unique_idx").on(table.projectId, table.slug)]
)

export type FeatureFlowRow = typeof featureFlows.$inferSelect
export type NewFeatureFlowRow = typeof featureFlows.$inferInsert
