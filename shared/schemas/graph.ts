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
	/** Signature — function/method nodes only. */
	signature: SignatureSchema.optional(),
	/** Docstring / summary. AI-inferred or authored. */
	description: DescriptionSchema.optional(),
	/** Canvas position. Explicit — no auto-layout yet. Relative to parent if nested. */
	position: PositionSchema,
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
