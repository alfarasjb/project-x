import { z } from "zod"

/**
 * Issue schema — one architectural finding from the audit pass.
 *
 * Audit runs at the end of every crawl: rules read the classified graph
 * and emit `Issue[]` which is persisted alongside the graph on the
 * project. The dashboard Issue Feed reads them back; the MCP server will
 * eventually expose them to coding agents too.
 *
 * Identity rule: `id` MUST be stable across crawls for the same finding
 * (e.g. `circular:a.ts<->b.ts<->c.ts` with sorted members) so the next
 * audit can preserve `firstDetected` and "new since last crawl" state.
 */

export const IssueSeveritySchema = z.enum(["critical", "warning", "info"])
export type IssueSeverity = z.infer<typeof IssueSeveritySchema>

/**
 * Open category label — kept as a string so rules can introduce new
 * categories without a schema migration. The Issue Feed UI maps known
 * categories to nicer labels and falls back to the raw value.
 */
export const IssueCategorySchema = z.string().min(1)
export type IssueCategory = z.infer<typeof IssueCategorySchema>

/**
 * Reach of an issue — total + breakdown. Filled in once we have graph
 * traversal helpers; deferred for the first audit milestone, so it's
 * optional on the schema.
 */
export const BlastRadiusSchema = z.object({
	total: z.number().int().nonnegative(),
	upstream: z.number().int().nonnegative(),
	downstream: z.number().int().nonnegative(),
	modulesTouched: z.number().int().nonnegative()
})
export type BlastRadius = z.infer<typeof BlastRadiusSchema>

export const IssueSchema = z.object({
	/** Stable id, deterministic from the finding's content. */
	id: z.string().min(1),
	category: IssueCategorySchema,
	severity: IssueSeveritySchema,
	/** One-liner shown collapsed on the card. */
	title: z.string().min(1),
	/** Longer-form explanation shown when expanded. */
	description: z.string().min(1),
	/** Node paths the issue points at — usually file paths. */
	affected: z.array(z.string().min(1)),
	blastRadius: BlastRadiusSchema.optional(),
	/** ISO timestamp of when this finding was first observed across crawls. */
	firstDetected: z.string().min(1)
})
export type Issue = z.infer<typeof IssueSchema>

export const IssuesSchema = z.array(IssueSchema)

export const EMPTY_ISSUES: Issue[] = []
