ALTER TABLE "projectx"."projects" ALTER COLUMN "root_path" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "projectx"."projects" ADD COLUMN "repo_url" text;