import { z } from "zod"
import { GraphSchema } from "@shared/schemas/graph"

/**
 * Feature flow schemas — the API boundary for saved per-feature views.
 *
 * Two wire shapes, mirroring the project pattern (summary omits the heavy
 * JSONB):
 *   - `FeatureFlowSummarySchema` — the list shape. Carries node/edge *counts*
 *     (computed server-side) instead of the full graph, so the list endpoint
 *     stays small.
 *   - `FeatureFlowSchema` — the detail shape. Adds the full `graph` the canvas
 *     renders.
 *
 * A flow's `graph` is a self-contained `{ nodes, edges }` (the same
 * `GraphSchema` the parsed graph uses), not a list of ids into the parsed
 * graph — see the `feature_flows` table comment for why.
 */
export const FeatureFlowSummarySchema = z.object({
	id: z.uuid(),
	/** Owning project. */
	projectId: z.uuid(),
	/** URL-friendly identifier, unique per-project. The canvas URL resolves against this. */
	slug: z.string().min(1),
	/** Display name. */
	name: z.string().min(1),
	/** Short subtitle for the list card. */
	description: z.string().min(1).nullable(),
	/** Node count in the flow's graph — for the list card, without shipping the graph. */
	nodeCount: z.number().int().nonnegative(),
	/** Edge count in the flow's graph. */
	edgeCount: z.number().int().nonnegative(),
	createdAt: z.string(),
	updatedAt: z.string().nullable()
})
export type FeatureFlowSummary = z.infer<typeof FeatureFlowSummarySchema>

/** Detail shape — summary plus the full graph the canvas renders. */
export const FeatureFlowSchema = FeatureFlowSummarySchema.extend({
	graph: GraphSchema
})
export type FeatureFlow = z.infer<typeof FeatureFlowSchema>

export const FeatureFlowsSchema = z.array(FeatureFlowSummarySchema)

/**
 * Create input. `slug` is optional — derived from `name` when omitted. The
 * write path is server-internal for now (the seed; later the ARG-11 agent),
 * so there's no manual-create REST route yet, but the schema is the one
 * boundary both will validate against.
 */
export const CreateFeatureFlowSchema = z.object({
	name: z.string().min(1).max(120),
	slug: z
		.string()
		.min(1)
		.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be kebab-case")
		.optional(),
	description: z.string().min(1).max(280).optional(),
	graph: GraphSchema
})
export type CreateFeatureFlow = z.infer<typeof CreateFeatureFlowSchema>
