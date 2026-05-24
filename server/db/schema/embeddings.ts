import { index, integer, primaryKey, text, uuid, vector } from "drizzle-orm/pg-core"
import { schema, timestamp, timestampConfig } from "@server/db/schema/common"
import { projects } from "@server/db/schema/projects"

/**
 * Per-node embeddings for similarity search.
 *
 * Identity is `(project_id, node_id)` — composite PK because nodes don't have
 * global ids; they're scoped to a project's graph. Cascade on project delete
 * so archive/unarchive (soft delete, no cascade) keeps embeddings, while a
 * future hard-delete sweeps them.
 *
 * Only file + module nodes are embedded — symbols (functions, classes,
 * constants) live in the graph as data but aren't first-class search
 * targets in v1. The `kind` column is filtered on at query time so
 * `findSimilarNodes` can default to peer-level matches (file→file, not
 * file→module).
 *
 * `content_hash` mirrors `analyzedHash` on the graph node: when the source
 * description changes (re-analyze advanced the hash), the embedding is
 * stale and the embed pipeline re-runs it. Skip-unchanged is the same
 * pattern Analyze uses; embedding cost stays close to zero on incremental
 * crawls.
 */
export const nodeEmbeddings = schema.table(
	"node_embeddings",
	{
		projectId: uuid("project_id")
			.notNull()
			.references(() => projects.id, { onDelete: "cascade" }),
		nodeId: text("node_id").notNull(),
		/** "file" | "module" today; column kept open in case symbol-level ships later. */
		kind: text("kind").notNull(),
		/** voyage-code-3 default = 1024; pinned in `EMBEDDING_CHAINS["embed-node"]`. */
		embedding: vector("embedding", { dimensions: 1024 }).notNull(),
		/** Hash of the input text the vector was computed from (skip-unchanged dedup). */
		contentHash: text("content_hash").notNull(),
		/** Embedding model id (e.g. "voyage-code-3") so a model swap re-embeds. */
		model: text("model").notNull(),
		dimensions: integer("dimensions").notNull(),
		embeddedAt: timestamp("embedded_at", timestampConfig).notNull()
	},
	(table) => [
		primaryKey({ columns: [table.projectId, table.nodeId] }),
		// HNSW + cosine ops — the right pick for text embeddings (voyage outputs
		// unit-normalized vectors so cosine is equivalent to inner product, but
		// being explicit makes the choice readable and the query simpler).
		index("node_embeddings_hnsw_idx")
			.using("hnsw", table.embedding.op("vector_cosine_ops"))
			.with({ m: 16, ef_construction: 64 }),
		// Filter index for `WHERE project_id = ... AND kind = ...` — pgvector
		// supports filtered ANN search via this btree prefix on the same table.
		index("node_embeddings_project_kind_idx").on(table.projectId, table.kind)
	]
)

export type NodeEmbedding = typeof nodeEmbeddings.$inferSelect
export type NewNodeEmbedding = typeof nodeEmbeddings.$inferInsert
