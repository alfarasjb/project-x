import { z } from "zod"

/**
 * Project schemas — the API boundary for project management.
 *
 * `ProjectSchema` is the *summary* shape returned by the project list and
 * detail endpoints. It deliberately omits the `intentGraph` / `actualGraph`
 * JSONB blobs — those are large and fetched separately via the graph endpoint.
 *
 * A project sources its code from EITHER a local filesystem path
 * (`rootPath`, legacy/dogfood) OR a GitHub clone URL (`repoUrl`, new
 * default). The domain layer enforces exactly-one-of; the schema reflects
 * both as optional strings so the wire shape stays simple.
 */
export const ProjectSchema = z.object({
	id: z.uuid(),
	/** Owning organization — populated from the session, never client-supplied. */
	organizationId: z.string().min(1),
	/** URL-friendly identifier, derived from `name` on creation. Unique per-org. */
	slug: z.string().min(1),
	/** Display name. */
	name: z.string().min(1),
	/** Absolute filesystem path to the repo. Set only on legacy/dogfood projects. */
	rootPath: z.string().min(1).nullable(),
	/** GitHub clone URL. Set only on projects imported from GitHub. */
	repoUrl: z.string().min(1).nullable(),
	/** When the repo was last crawled; null until the first crawl. */
	lastParsedAt: z.string().nullable(),
	/** Set when the project is archived (soft-deleted); null while active. */
	archivedAt: z.string().nullable(),
	createdAt: z.string(),
	updatedAt: z.string().nullable()
})
export type Project = z.infer<typeof ProjectSchema>

/**
 * POST /api/projects request body — either a local `rootPath` (legacy/dogfood)
 * or a GitHub `repoUrl` (the import-from-GitHub flow). The discriminated
 * union forces callers to pick exactly one path and gives the server a
 * single shape to switch on.
 */
const CreateProjectBaseSchema = z.object({
	name: z.string().min(1, "Name is required").max(120)
})

export const CreateProjectSchema = z.discriminatedUnion("source", [
	CreateProjectBaseSchema.extend({
		source: z.literal("local"),
		/** Absolute path to a local repo directory — validated server-side. */
		rootPath: z.string().min(1, "Repository path is required")
	}),
	CreateProjectBaseSchema.extend({
		source: z.literal("github"),
		/** Full clone URL (`https://github.com/owner/repo`). */
		repoUrl: z.url("Repository URL is required")
	})
])
export type CreateProject = z.infer<typeof CreateProjectSchema>

/**
 * POST /api/projects/:id/rename request body.
 *
 * Renames affect only the display `name`. The `slug` stays stable — it's
 * what URLs / bookmarks / MCP `PROJECT_X_PROJECT` env var resolve against,
 * and changing it on rename would silently break links.
 */
export const RenameProjectSchema = z.object({
	name: z.string().min(1, "Name is required").max(120)
})
export type RenameProject = z.infer<typeof RenameProjectSchema>
