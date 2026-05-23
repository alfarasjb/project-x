import { z } from "zod"

/**
 * Project X graph schema.
 *
 * Language-agnostic by design:
 *   - A node's identity is its `path` ("src/auth" for a module,
 *     "src/auth/jwt.ts#login" for a symbol). Every language has files + folders.
 *   - `kind` is an OPEN string label the parser fills in. TS emits
 *     "class"/"function"; Rust would emit "struct"/"trait". The graph engine
 *     never branches on `kind`.
 *   - Nesting is expressed via `parentId` (recursive containment), NOT edges.
 *     Edges are cross-node relationships only.
 *
 * Constants, types, and interfaces are first-class nodes (kind: "constant" |
 * "interface" | ...) — the parser emits them like any symbol.
 */

/** Architectural tier. Modules carry it; symbol-level nodes usually don't. */
export const NodeLayerSchema = z.enum([
	"entrypoint",
	"route",
	"service",
	"data",
	"ui",
	"shared",
	"external"
])
export type NodeLayer = z.infer<typeof NodeLayerSchema>

/**
 * Audit-derived role for a node. Distinct from `layer` (intent) — this is
 * what the node *is* in practice, inferred by examining the code.
 *
 * Populated by the AI classification pipeline (MCP-driven for now;
 * server-side AI later). Optional: nodes with no classification yet are
 * treated as "unclassified" and surfaced for the next pass. Symbols
 * inherit from their parent file; only files + modules carry their own.
 */
export const NodeClassificationSchema = z.enum([
	"business-logic",
	"routing",
	"utility",
	"data-access",
	"ui-component",
	"config",
	"type-definition",
	"unknown"
])
export type NodeClassification = z.infer<typeof NodeClassificationSchema>

/** Recommended `kind` values — NOT exhaustive. `kind` is an open label. */
export const KNOWN_NODE_KINDS = [
	"module",
	"file",
	"class",
	"function",
	"method",
	"interface",
	"type",
	"constant",
	"struct",
	"enum",
	"trait"
] as const

/** Cross-node relationships. Containment is `parentId`, not an edge. */
export const EdgeKindSchema = z.enum(["dependency", "data-flow", "api-call"])
export type EdgeKind = z.infer<typeof EdgeKindSchema>

export const PositionSchema = z.object({ x: z.number(), y: z.number() })
export type Position = z.infer<typeof PositionSchema>

export const SizeSchema = z.object({
	width: z.number().positive(),
	height: z.number().positive()
})
export type Size = z.infer<typeof SizeSchema>

/**
 * A reference to a type.
 *   - `name` is the display string ("User", "Promise<Token>", "string").
 *   - `ref` is the id of the node where that type is declared, when known.
 *     Optional: the parser leaves it empty for now; a future resolver fills it,
 *     at which point the type becomes a clickable jump-to-declaration. Keeping
 *     `ref` in the schema from day one means that upgrade is not a migration.
 */
export const TypeRefSchema = z.object({
	name: z.string().min(1),
	ref: z.string().min(1).optional()
})
export type TypeRef = z.infer<typeof TypeRefSchema>

/** A single parameter of a callable. */
export const ParameterSchema = z.object({
	name: z.string().min(1),
	/** Type annotation. Absent in untyped languages or unannotated params. */
	type: TypeRefSchema.optional(),
	/** True if the parameter is optional / has a default. */
	optional: z.boolean().optional()
})
export type Parameter = z.infer<typeof ParameterSchema>

/** A callable's signature. Attached to function/method nodes only. */
export const SignatureSchema = z.object({
	parameters: z.array(ParameterSchema),
	returnType: TypeRefSchema.optional()
})
export type Signature = z.infer<typeof SignatureSchema>

/** Where a description came from. */
export const DescriptionSourceSchema = z.enum(["ai", "manual"])
export type DescriptionSource = z.infer<typeof DescriptionSourceSchema>

/**
 * A node's human-readable doc — its docstring / summary.
 *   - `what` — searchable summary. This is what agent search / RAG matches on.
 *   - `why` — rationale. Optional; trivial nodes (getters, re-exports) omit it.
 *   - `source` — "manual" (authored in code or by a user) | "ai" (inferred).
 */
export const DescriptionSchema = z.object({
	what: z.string().min(1),
	why: z.string().min(1).optional(),
	source: DescriptionSourceSchema
})
export type Description = z.infer<typeof DescriptionSchema>

/**
 * Categories of intra-file concerns the AI analyze pass can flag. Closed
 * enum — we own the taxonomy so the UI can group/filter without parsing
 * free-form strings, and so prompt drift can't silently introduce new
 * buckets. Add a category here AND in the analyze system prompt; don't
 * add only one.
 *
 * - `mixed-responsibilities` — file does multiple unrelated things
 * - `misplaced-content`      — content doesn't match the classification
 *                              (e.g. DB call in a route handler)
 * - `hardcoded-domain-values` — magic strings/numbers that should be
 *                              constants or config (role names, plan ids)
 * - `long-inline-logic`      — a handler/function too long to keep inline;
 *                              should be extracted to a domain function
 * - `dead-or-stub-code`      — TODO-heavy, commented-out blocks,
 *                              placeholder exports
 * - `unclear-naming`         — names that actively mislead (`utils.ts`
 *                              full of DB queries, "helper" load-bearing)
 * - `other`                  — escape hatch; concerns that don't fit
 */
export const ConcernCategorySchema = z.enum([
	"mixed-responsibilities",
	"misplaced-content",
	"hardcoded-domain-values",
	"long-inline-logic",
	"dead-or-stub-code",
	"unclear-naming",
	"other"
])
export type ConcernCategory = z.infer<typeof ConcernCategorySchema>

/**
 * A single concern the AI noticed in a file. The category drives UI
 * grouping/filtering; the message is the human-readable one-liner shown
 * in the issue card.
 */
export const ConcernSchema = z.object({
	category: ConcernCategorySchema,
	message: z.string().min(1).max(500)
})
export type Concern = z.infer<typeof ConcernSchema>

/**
 * Cheap per-node metrics the parser emits. Populated for file nodes by
 * the TS parser today (`lineCount`, `exportCount`, `contentHash`); other
 * node kinds may leave it undefined. Audit rules read these to flag god
 * files; the analyze phase uses `contentHash` to skip unchanged files
 * (a hash-match against the previous crawl ⇒ no LLM call needed).
 */
export const MetricsSchema = z.object({
	lineCount: z.number().int().nonnegative().optional(),
	exportCount: z.number().int().nonnegative().optional(),
	/** sha256 of the file contents, first 16 hex chars. File nodes only. */
	contentHash: z.string().min(1).optional()
})
export type Metrics = z.infer<typeof MetricsSchema>

export const GraphNodeSchema = z.object({
	/** Stable unique id. Edges reference this. */
	id: z.string().min(1),
	/** Language-agnostic identity: "src/auth" | "src/auth/jwt.ts#login". */
	path: z.string().min(1),
	/** Open label — "module" | "class" | "function" | "constant" | ... */
	kind: z.string().min(1),
	/** Display name. */
	label: z.string().min(1),
	/** Containment parent; null = top level. Nesting, not an edge. */
	parentId: z.string().min(1).nullable(),
	/** Architectural tier — modules carry it; symbols usually omit it. */
	layer: NodeLayerSchema.optional(),
	/**
	 * Audit-derived role (business-logic / routing / data-access / …).
	 * Populated by the classification pass; symbols inherit from their
	 * parent file, so usually only file/module nodes set it explicitly.
	 */
	classification: NodeClassificationSchema.optional(),
	/** Cheap parser-emitted metrics (line count, export count). File nodes only. */
	metrics: MetricsSchema.optional(),
	/** Signature — function/method nodes only. */
	signature: SignatureSchema.optional(),
	/** Docstring / summary. AI-inferred or authored. */
	description: DescriptionSchema.optional(),
	/**
	 * The `metrics.contentHash` value at the moment the AI analyze pass last
	 * wrote this node's `classification` + `description`. The analyze step
	 * skips a node when its current `contentHash` still matches this — that's
	 * the "don't re-analyze unchanged files" dedup. Preserved across crawls
	 * by `mergePreservedFields`; cleared by `setNodeClassification`/manual
	 * description writes because those provenance paths don't go through AI.
	 */
	analyzedHash: z.string().min(1).optional(),
	/**
	 * Concerns the AI analyze pass flagged while reading this file's
	 * content. Empty (or absent) means the file looked clean. The audit's
	 * `aiReview` rule walks these to emit `ai-review` issues — count
	 * determines severity (1→info, 2→warning, 3+→critical), Claude itself
	 * does not assign severity.
	 */
	concerns: z.array(ConcernSchema).optional(),
	/**
	 * Canvas position, relative to parent if nested. Set by the user (intent
	 * graph) or by a layout pass (parsed graphs). Optional — the parser emits
	 * topology only; layout assigns positions before render.
	 */
	position: PositionSchema.optional(),
	/** Explicit box size. Containers set this; leaf nodes auto-size. */
	size: SizeSchema.optional()
})
export type GraphNode = z.infer<typeof GraphNodeSchema>

export const GraphEdgeSchema = z.object({
	id: z.string().min(1),
	/** Source node id. */
	source: z.string().min(1),
	/** Target node id. */
	target: z.string().min(1),
	kind: EdgeKindSchema,
	/** Optional interface label, e.g. "login(creds): Promise<Token>". */
	interface: z.string().optional()
})
export type GraphEdge = z.infer<typeof GraphEdgeSchema>

export const GraphSchema = z.object({
	nodes: z.array(GraphNodeSchema),
	edges: z.array(GraphEdgeSchema)
})
export type Graph = z.infer<typeof GraphSchema>

export const EMPTY_GRAPH: Graph = { nodes: [], edges: [] }

/**
 * Response from `POST /api/projects/:id/analyze`. Carries the updated graph
 * (so the client can swap it into the cache without a follow-up GET) plus
 * counters for the toast/log: how many nodes were classified this run, how
 * many were skipped (content-hash match), and how many per-node failures we
 * swallowed.
 */
export const AnalyzeResultSchema = z.object({
	graph: GraphSchema,
	analyzed: z.number().int().nonnegative(),
	skipped: z.number().int().nonnegative(),
	failed: z.number().int().nonnegative()
})
export type AnalyzeResult = z.infer<typeof AnalyzeResultSchema>
