import { and, eq, inArray, ne, sql } from "drizzle-orm"
import { getDb } from "@server/db"
import { nodeEmbeddings } from "@server/db/schema/embeddings"
import { getEmbeddingAdapter } from "@server/llm/fallback/factory"
import { EMBEDDING_OPERATIONS } from "@server/llm/fallback/chains"

/** Default for `findSimilarToText` when caller doesn't restrict — both file + module. */
const DEFAULT_TEXT_QUERY_KINDS: readonly string[] = ["file", "module"]

export interface SimilarNode {
	nodeId: string
	kind: string
	/** Cosine distance from pgvector's `<=>` operator. 0 = identical, 2 = opposite. */
	distance: number
}

/**
 * Find the k nearest neighbours of one node within a project.
 *
 * Defaults to peer-level matches — if you ask "what's similar to login.ts",
 * you almost always want OTHER files, not the module it lives in. Pass
 * `kinds: ['file', 'module']` to widen.
 *
 * Excludes the source node itself from results (the closest match would
 * otherwise always be itself with distance 0).
 */
export async function findSimilarNodes(params: {
	projectId: string
	nodeId: string
	k?: number
	kinds?: readonly string[]
}): Promise<SimilarNode[]> {
	const k = params.k ?? 5
	const db = getDb()
	const source = await db
		.select({ embedding: nodeEmbeddings.embedding, kind: nodeEmbeddings.kind })
		.from(nodeEmbeddings)
		.where(
			and(eq(nodeEmbeddings.projectId, params.projectId), eq(nodeEmbeddings.nodeId, params.nodeId))
		)
		.limit(1)

	const sourceRow = source[0]
	if (!sourceRow) return []
	const kinds = params.kinds ?? [sourceRow.kind]

	const distance = sql<number>`${nodeEmbeddings.embedding} <=> ${sql.raw(toVectorLiteral(sourceRow.embedding))}::vector`
	const rows = await db
		.select({
			nodeId: nodeEmbeddings.nodeId,
			kind: nodeEmbeddings.kind,
			distance
		})
		.from(nodeEmbeddings)
		.where(
			and(
				eq(nodeEmbeddings.projectId, params.projectId),
				ne(nodeEmbeddings.nodeId, params.nodeId),
				inArray(nodeEmbeddings.kind, [...kinds])
			)
		)
		.orderBy(distance)
		.limit(k)

	return rows.map((row) => ({ nodeId: row.nodeId, kind: row.kind, distance: row.distance }))
}

/**
 * Find the k nearest neighbours of a free-form text query within a project.
 *
 * Embeds the query through the same Voyage adapter so the vector space
 * matches the stored embeddings. Defaults to both file + module kinds —
 * text queries are abstract enough that either level might be the right
 * answer.
 */
export async function findSimilarToText(params: {
	projectId: string
	text: string
	k?: number
	kinds?: readonly string[]
}): Promise<SimilarNode[]> {
	const k = params.k ?? 5
	const kinds = params.kinds ?? DEFAULT_TEXT_QUERY_KINDS
	const adapter = getEmbeddingAdapter(EMBEDDING_OPERATIONS.EMBED_NODE)
	const { embeddings } = await adapter.embed({ text: params.text })
	const queryVector = embeddings[0]
	if (!queryVector) return []

	const db = getDb()
	const distance = sql<number>`${nodeEmbeddings.embedding} <=> ${sql.raw(toVectorLiteral(queryVector))}::vector`
	const rows = await db
		.select({
			nodeId: nodeEmbeddings.nodeId,
			kind: nodeEmbeddings.kind,
			distance
		})
		.from(nodeEmbeddings)
		.where(
			and(eq(nodeEmbeddings.projectId, params.projectId), inArray(nodeEmbeddings.kind, [...kinds]))
		)
		.orderBy(distance)
		.limit(k)

	return rows.map((row) => ({ nodeId: row.nodeId, kind: row.kind, distance: row.distance }))
}

/**
 * pgvector wants the literal in `'[1,2,3]'` form. Drizzle's parameterized
 * `${vector}` interpolation works for stored columns but not for ad-hoc
 * comparison vectors in a SQL expression, so we serialize manually. Safe
 * against injection — vectors are `number[]` and we coerce via JSON.
 */
function toVectorLiteral(vector: readonly number[]): string {
	return `'[${vector.join(",")}]'`
}
