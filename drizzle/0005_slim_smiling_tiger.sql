CREATE TABLE "projectx"."feature_flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"graph" jsonb DEFAULT '{"nodes":[],"edges":[]}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "projectx"."feature_flows" ADD CONSTRAINT "feature_flows_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projectx"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "feature_flows_project_slug_unique_idx" ON "projectx"."feature_flows" USING btree ("project_id","slug");