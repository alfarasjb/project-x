import { z } from "zod"

export const NodeLayerSchema = z.enum(["entrypoint", "route", "service", "data", "ui", "shared"])
export type NodeLayer = z.infer<typeof NodeLayerSchema>

export const EdgeTypeSchema = z.enum(["dependency", "data-flow", "api-call"])
export type EdgeType = z.infer<typeof EdgeTypeSchema>

export const GraphNodeSchema = z.object({
	id: z.string().min(1),
	label: z.string().min(1),
	files: z.array(z.string()).default([]),
	exports: z.array(z.string()).default([]),
	responsibilities: z.string().default(""),
	layer: NodeLayerSchema
})
export type GraphNode = z.infer<typeof GraphNodeSchema>

export const GraphEdgeSchema = z.object({
	source: z.string().min(1),
	target: z.string().min(1),
	type: EdgeTypeSchema,
	interface: z.string().optional()
})
export type GraphEdge = z.infer<typeof GraphEdgeSchema>

export const GraphConstraintSchema = z.object({
	rule: z.string().min(1),
	description: z.string(),
	enforces: z.string()
})
export type GraphConstraint = z.infer<typeof GraphConstraintSchema>

export const GraphSchema = z.object({
	modules: z.array(GraphNodeSchema),
	edges: z.array(GraphEdgeSchema),
	constraints: z.array(GraphConstraintSchema).default([])
})
export type Graph = z.infer<typeof GraphSchema>

export const EMPTY_GRAPH: Graph = { modules: [], edges: [], constraints: [] }
