import { z } from "zod"

/**
 * Project schemas — the API boundary for project management.
 *
 * `ProjectSchema` is the *summary* shape returned by the project list and
 * detail endpoints. It deliberately omits the `intentGraph` / `actualGraph`
 * JSONB blobs — those are large and fetched separately via the graph endpoint.
 */
export const ProjectSchema = z.object({
	id: z.uuid(),
	/** Owning organization — populated from the session, never client-supplied. */
	organizationId: z.string().min(1),
	/** URL-friendly identifier, derived from `name` on creation. Unique per-org. */
	slug: z.string().min(1),
	/** Display name. */
	name: z.string().min(1),
	/** Absolute filesystem path to the repo this project tracks. */
	rootPath: z.string().min(1),
	/** When the repo was last crawled; null until the first crawl. */
	lastParsedAt: z.string().nullable(),
	/** Set when the project is archived (soft-deleted); null while active. */
	archivedAt: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string().nullable()
})
export type Project = z.infer<typeof ProjectSchema>

/** POST /api/projects request body. */
export const CreateProjectSchema = z.object({
	name: z.string().min(1, "Name is required").max(120),
	/** Absolute path to a local repo directory — validated server-side. */
	rootPath: z.string().min(1, "Repository path is required")
})
export type CreateProject = z.infer<typeof CreateProjectSchema>
