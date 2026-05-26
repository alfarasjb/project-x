import { z } from "zod"

/**
 * Integration schemas — wire shapes for `/api/integrations/*`. Kept lean and
 * UI-shaped, not 1:1 with GitHub's API. If we add more integrations (GitLab,
 * etc.) they slot in here as parallel schemas.
 */

/**
 * GET /api/integrations/github response.
 *
 * `connected: false` is the disconnected state (no GitHub OAuth-app
 * credentials configured server-side OR the user hasn't linked yet). The
 * `configured` flag distinguishes the two: a server with no
 * `GITHUB_CLIENT_ID` can't offer a Connect button no matter what.
 */
export const GithubStatusSchema = z.object({
	/** True only when both GitHub OAuth credentials are set on the server. */
	configured: z.boolean(),
	/** True when the current user has a linked GitHub account. */
	connected: z.boolean(),
	/** GitHub login (e.g. "alfarasjb"). Present iff `connected`. */
	login: z.string().nullable(),
	/** Scopes the stored token has (e.g. "repo,read:user"). Present iff `connected`. */
	scope: z.string().nullable()
})
export type GithubStatus = z.infer<typeof GithubStatusSchema>

/** A single repository entry — only the fields the import UI renders. */
export const GithubRepoSchema = z.object({
	id: z.number().int(),
	/** Human-facing `owner/repo` slug. */
	fullName: z.string().min(1),
	name: z.string().min(1),
	description: z.string().nullable(),
	private: z.boolean(),
	htmlUrl: z.url(),
	cloneUrl: z.url(),
	defaultBranch: z.string().min(1),
	/** ISO-8601 timestamp of the last push. */
	updatedAt: z.string()
})
export type GithubRepo = z.infer<typeof GithubRepoSchema>

/** GET /api/integrations/github/repos response. */
export const GithubReposSchema = z.object({
	repos: z.array(GithubRepoSchema),
	/** True when GitHub's Link header indicates another page exists. */
	hasMore: z.boolean(),
	/** Echo of the page index we returned (1-based, matches GH's pagination). */
	page: z.number().int().positive()
})
export type GithubReposResponse = z.infer<typeof GithubReposSchema>
