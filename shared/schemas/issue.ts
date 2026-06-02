import { z } from "zod"
import { ConcernSchema } from "@shared/schemas/graph"

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

/**
 * Verdict from the `refine-duplicate-cluster` handler — Claude's precision
 * pass over a recall-tuned `duplicate-candidates` cluster. Applies to the
 * cluster members that remain after `excluded`.
 */
export const RefinementVerdictSchema = z.enum(["duplicate", "partial", "false-positive"])
export type RefinementVerdict = z.infer<typeof RefinementVerdictSchema>

/**
 * Verdict from the `refine-god-file` agent-loop handler — Claude traverses the
 * file's graph neighbourhood (its dependencies, dependents, and peers) to judge
 * whether the line-count flag is a real scope problem.
 *   "should-split"   — genuinely tangled responsibilities; `splitPlan` describes the seams.
 *   "partial"        — mostly cohesive, but one chunk wants extracting; `splitPlan` names it.
 *   "false-positive" — large but legitimately cohesive (a schema, a registry, generated code). No action.
 */
export const GodFileVerdictSchema = z.enum(["should-split", "partial", "false-positive"])
export type GodFileVerdict = z.infer<typeof GodFileVerdictSchema>

/**
 * Verdict from the `refine-circular-dependency` handler — Claude's 1-shot pass
 * over a heuristic `circular-dependency` finding (a DFS-detected import cycle).
 *   "break-cycle"    — a genuine harmful cycle (tree-shaking / init-order risk); break it.
 *   "acceptable"     — a real cycle, but tolerable (type-only or test-only imports). No urgent action.
 *   "false-positive" — not actually a runtime cycle (e.g. a parser misread). No action.
 */
export const CircularDependencyVerdictSchema = z.enum([
	"break-cycle",
	"acceptable",
	"false-positive"
])
export type CircularDependencyVerdict = z.infer<typeof CircularDependencyVerdictSchema>

/**
 * Verdict from the `refine-boundary-violation` agent-loop handler — Claude
 * traverses the flagged source file's graph neighbourhood to judge whether a
 * cross-layer import is a real architectural breach.
 *   "violation"      — a genuine boundary breach; the import should be removed or rerouted. Provide remediation.
 *   "acceptable"     — crosses a layer but justified (a composition root, a thin re-export, an intentional exception). No action.
 *   "false-positive" — the classification was wrong, so it isn't really a cross-layer edge. No action.
 */
export const BoundaryViolationVerdictSchema = z.enum(["violation", "acceptable", "false-positive"])
export type BoundaryViolationVerdict = z.infer<typeof BoundaryViolationVerdictSchema>

/**
 * Second-pass LLM refinement attached to an issue — a discriminated union keyed
 * on `kind`, one variant per handler. Written in place on the issue row by the
 * handler; absent until refined. `sourceHashes` (on every variant) maps each
 * judged node path to its `metrics.contentHash` at refine time, so the handler
 * can skip an issue whose source files are all unchanged since its last
 * refinement (the same skip-unchanged contract analyze uses).
 */

/**
 * Duplicate-cluster verdict. `excluded` carries the split: cluster members the
 * model judged proximity-only (not actually duplicating the rest). The verdict +
 * consolidation describe the genuine group — the affected members NOT in `excluded`.
 */
export const DuplicateRefinementSchema = z.object({
	kind: z.literal("duplicate"),
	verdict: RefinementVerdictSchema,
	reasoning: z.string().min(1),
	/** Plain-text consolidation advice. Present for duplicate/partial, absent for false-positive. */
	consolidation: z.string().min(1).optional(),
	/** Cluster members split out as proximity-only false positives. */
	excluded: z.array(z.string().min(1)).optional(),
	sourceHashes: z.record(z.string(), z.string())
})
export type DuplicateRefinement = z.infer<typeof DuplicateRefinementSchema>

/** God-file verdict. `splitPlan` is present for should-split/partial, absent for false-positive. */
export const GodFileRefinementSchema = z.object({
	kind: z.literal("god-file"),
	verdict: GodFileVerdictSchema,
	reasoning: z.string().min(1),
	/** Plain-text advice on the seams to split along. Absent for false-positive. */
	splitPlan: z.string().min(1).optional(),
	sourceHashes: z.record(z.string(), z.string())
})
export type GodFileRefinement = z.infer<typeof GodFileRefinementSchema>

/** Circular-dependency verdict. `resolution` is present for break-cycle/acceptable, absent for false-positive. */
export const CircularDependencyRefinementSchema = z.object({
	kind: z.literal("circular-dependency"),
	verdict: CircularDependencyVerdictSchema,
	reasoning: z.string().min(1),
	/** Plain-text advice on how to break (or why to tolerate) the cycle. Absent for false-positive. */
	resolution: z.string().min(1).optional(),
	sourceHashes: z.record(z.string(), z.string())
})
export type CircularDependencyRefinement = z.infer<typeof CircularDependencyRefinementSchema>

/** Boundary-violation verdict. `remediation` is present for violation, absent otherwise. */
export const BoundaryViolationRefinementSchema = z.object({
	kind: z.literal("boundary-violation"),
	verdict: BoundaryViolationVerdictSchema,
	reasoning: z.string().min(1),
	/** Plain-text advice on how to reroute the import. Absent for acceptable/false-positive. */
	remediation: z.string().min(1).optional(),
	sourceHashes: z.record(z.string(), z.string())
})
export type BoundaryViolationRefinement = z.infer<typeof BoundaryViolationRefinementSchema>

const RefinementUnionSchema = z.discriminatedUnion("kind", [
	DuplicateRefinementSchema,
	GodFileRefinementSchema,
	CircularDependencyRefinementSchema,
	BoundaryViolationRefinementSchema
])

/**
 * Refinements written before ARG-9 carried no `kind` — they were all
 * duplicate-cluster verdicts. Normalize those legacy rows to the "duplicate"
 * variant on parse so `IssuesSchema.parse` keeps accepting stored data without
 * a migration (the column is JSONB; nothing rewrites old rows in place).
 */
export const IssueRefinementSchema = z.preprocess((value) => {
	if (value !== null && typeof value === "object" && !("kind" in value)) {
		return { ...value, kind: "duplicate" }
	}
	return value
}, RefinementUnionSchema)
export type IssueRefinement = z.infer<typeof IssueRefinementSchema>

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
	/**
	 * Structured concerns attached to an issue — populated by the AI
	 * `aiReview` rule so the UI can render them as a tagged list instead
	 * of parsing the description string. Other rules leave this empty.
	 */
	concerns: z.array(ConcernSchema).optional(),
	/**
	 * Second-pass LLM refinement — populated by the duplicate-candidates
	 * handler. Absent until the handler runs; carried across crawls like the
	 * rest of the issue (preserved by `mergeIssueHistory` when the id matches).
	 */
	refinement: IssueRefinementSchema.optional(),
	/** ISO timestamp of when this finding was first observed across crawls. */
	firstDetected: z.string().min(1)
})
export type Issue = z.infer<typeof IssueSchema>

export const IssuesSchema = z.array(IssueSchema)

export const EMPTY_ISSUES: Issue[] = []
