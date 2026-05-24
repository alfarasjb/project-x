-- Enable pgvector — drizzle-kit doesn't auto-emit extension creation.
-- Idempotent and cheap; safe to leave at the top of this migration even
-- though future migrations won't need to repeat it.
CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TABLE "projectx"."node_embeddings" (
	"project_id" uuid NOT NULL,
	"node_id" text NOT NULL,
	"kind" text NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"content_hash" text NOT NULL,
	"model" text NOT NULL,
	"dimensions" integer NOT NULL,
	"embedded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "node_embeddings_project_id_node_id_pk" PRIMARY KEY("project_id","node_id")
);
--> statement-breakpoint
ALTER TABLE "projectx"."node_embeddings" ADD CONSTRAINT "node_embeddings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projectx"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "node_embeddings_hnsw_idx" ON "projectx"."node_embeddings" USING hnsw ("embedding" vector_cosine_ops) WITH (m=16,ef_construction=64);--> statement-breakpoint
CREATE INDEX "node_embeddings_project_kind_idx" ON "projectx"."node_embeddings" USING btree ("project_id","kind");