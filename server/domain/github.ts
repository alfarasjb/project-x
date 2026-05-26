import { and, eq } from "drizzle-orm"
import { env } from "@server/env"
import { getDb } from "@server/db"
import { account } from "@server/db/schema/auth"
import { AppError } from "@server/utils/errors"
import type { GithubRepo, GithubStatus } from "@shared/schemas/integrations"

/**
 * GitHub integration domain — reads tokens from better-auth's `account` table
 * and proxies the bits of GitHub's REST API the import UI needs.
 *
 * Tokens are *not* exposed back to the client. Every call that needs the
 * token reads it here on the server, hits GitHub, and returns a UI-shaped
 * payload. Same pattern future integrations should follow.
 */

const GITHUB_PROVIDER_ID = "github"
const GITHUB_API = "https://api.github.com"

/**
 * Fetch the user's linked GitHub account row (token + scope + provider user
 * id). Returns null when no link exists. Better-auth stores the GitHub user
 * id (numeric, as a string) in `accountId`, not the login — we resolve the
 * login from GitHub's API when we need it.
 */
async function getGithubAccount(userId: string): Promise<{
	accessToken: string
	scope: string | null
} | null> {
	const db = getDb()
	const [row] = await db
		.select({ accessToken: account.accessToken, scope: account.scope })
		.from(account)
		.where(and(eq(account.userId, userId), eq(account.providerId, GITHUB_PROVIDER_ID)))
		.limit(1)
	if (!row?.accessToken) return null
	return { accessToken: row.accessToken, scope: row.scope }
}

/**
 * Revoke the user's OAuth grant on GitHub's side, then delete the local
 * account row. Without the GitHub-side revoke, GitHub treats the app as
 * still-authorized on the next Connect and silently re-issues a token with
 * the *previously* granted scopes — defeating any scope escalation we ask
 * for. Calling `DELETE /applications/{client_id}/grant` forces GitHub to
 * show the consent screen on the next link, so the user explicitly grants
 * the current scope set (including `repo`).
 *
 * GitHub's revoke endpoint uses HTTP Basic auth with client_id:client_secret
 * (not the user token), so we only need server-side env vars + the user's
 * access token in the body. 404 from GitHub means the grant is already
 * gone — treat that as success.
 */
export async function disconnectGithub(userId: string): Promise<void> {
	const link = await getGithubAccount(userId)
	if (!link) return // already disconnected

	if (env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET) {
		const basic = Buffer.from(`${env.GITHUB_CLIENT_ID}:${env.GITHUB_CLIENT_SECRET}`).toString(
			"base64"
		)
		const response = await fetch(`${GITHUB_API}/applications/${env.GITHUB_CLIENT_ID}/grant`, {
			method: "DELETE",
			headers: {
				Accept: "application/vnd.github+json",
				Authorization: `Basic ${basic}`,
				"X-GitHub-Api-Version": "2022-11-28",
				"User-Agent": "project-x",
				"Content-Type": "application/json"
			},
			body: JSON.stringify({ access_token: link.accessToken })
		})
		if (!response.ok && response.status !== 404) {
			// 404 = grant already gone; everything else we still proceed with
			// the local unlink so the user can re-link cleanly even when GitHub
			// is being weird.
			console.warn(
				`[github] revoke grant returned ${response.status} for user ${userId} — proceeding with local unlink anyway`
			)
		}
	}

	const db = getDb()
	await db
		.delete(account)
		.where(and(eq(account.userId, userId), eq(account.providerId, GITHUB_PROVIDER_ID)))
}

/**
 * Connection status for the integrations tab. `configured` reflects the
 * server's environment (no OAuth-app creds = can't offer the link flow at
 * all); `connected` reflects this specific user.
 */
export async function getGithubStatus(userId: string): Promise<GithubStatus> {
	const configured = Boolean(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET)
	const link = await getGithubAccount(userId)
	if (!link) {
		return { configured, connected: false, login: null, scope: null }
	}
	const login = await fetchViewerLogin(link.accessToken)
	return { configured, connected: true, login, scope: link.scope }
}

/**
 * List the user's GitHub repos, page 1-based, 30 per page (GitHub default).
 * Sorted by most-recently-pushed so the import UI surfaces relevant repos
 * first. `affiliation=owner,collaborator,organization_member` matches what
 * GitHub itself shows on the user's repo list — covers personal repos AND
 * repos in orgs the user belongs to.
 *
 * Search-as-you-type filtering happens client-side over the loaded pages.
 * Switch to the `/search/repositories` API only when we hit a real user
 * with hundreds of repos and the page-load UX breaks down.
 */
export async function listUserRepos(
	userId: string,
	options: { page?: number; perPage?: number } = {}
): Promise<{ repos: GithubRepo[]; hasMore: boolean; page: number }> {
	const link = await requireGithubLink(userId)
	const page = Math.max(1, Math.floor(options.page ?? 1))
	const perPage = Math.min(100, Math.max(1, Math.floor(options.perPage ?? 30)))
	const url = new URL(`${GITHUB_API}/user/repos`)
	url.searchParams.set("affiliation", "owner,collaborator,organization_member")
	url.searchParams.set("sort", "pushed")
	url.searchParams.set("direction", "desc")
	url.searchParams.set("per_page", String(perPage))
	url.searchParams.set("page", String(page))

	const response = await githubFetch(url, link.accessToken)
	const raw = (await response.json()) as unknown
	if (!Array.isArray(raw)) {
		throw new AppError(502, "GitHub returned an unexpected response listing repositories")
	}
	const hasMore = parseHasMorePage(response.headers.get("link"))
	return { repos: raw.map(toGithubRepo), hasMore, page }
}

/** Throws 409 when the user hasn't linked GitHub yet. */
async function requireGithubLink(userId: string): Promise<{ accessToken: string }> {
	const link = await getGithubAccount(userId)
	if (!link) {
		throw new AppError(409, "GitHub is not connected. Connect it under Settings → Integrations.")
	}
	return link
}

/**
 * Wrapper around `fetch` that sets GitHub's required headers + maps
 * non-2xx responses to actionable `AppError`s. Token-revoked / scope-missing
 * / rate-limited each get their own message so the UI can show something
 * useful instead of a generic 500.
 */
async function githubFetch(url: URL, accessToken: string): Promise<Response> {
	const response = await fetch(url, {
		headers: {
			Accept: "application/vnd.github+json",
			Authorization: `Bearer ${accessToken}`,
			"X-GitHub-Api-Version": "2022-11-28",
			"User-Agent": "project-x"
		}
	})
	if (response.ok) return response
	if (response.status === 401) {
		throw new AppError(
			401,
			"GitHub rejected the stored access token. Re-connect GitHub under Settings → Integrations."
		)
	}
	if (response.status === 403) {
		const rateRemaining = response.headers.get("x-ratelimit-remaining")
		if (rateRemaining === "0") {
			throw new AppError(429, "GitHub API rate limit exceeded. Try again in a few minutes.")
		}
		throw new AppError(
			403,
			"GitHub refused the request — the stored token may be missing required scopes (`repo`)."
		)
	}
	throw new AppError(502, `GitHub request failed (${response.status})`)
}

/** Fetch the authenticated user's `login` — used for display only. */
async function fetchViewerLogin(accessToken: string): Promise<string | null> {
	try {
		const response = await githubFetch(new URL(`${GITHUB_API}/user`), accessToken)
		const raw = (await response.json()) as { login?: unknown }
		return typeof raw.login === "string" ? raw.login : null
	} catch {
		// Status display is best-effort — a missing login shouldn't bring down
		// the whole integrations tab.
		return null
	}
}

/**
 * GitHub paginates with the RFC-5988 `Link` header. Presence of
 * `rel="next"` is the only signal we need ("are there more pages?"). We
 * don't follow the URL — the UI requests the next page itself with
 * `?page=N+1`.
 */
function parseHasMorePage(linkHeader: string | null): boolean {
	if (!linkHeader) return false
	return /\brel="next"/.test(linkHeader)
}

/**
 * Defensive narrowing from `unknown` to the `GithubRepo` shape we expose.
 * GitHub's response carries dozens of fields; we project to the ones the
 * UI uses and skip the rest. A bad field is a 502 — clearer than a runtime
 * mystery in the import dialog.
 */
function toGithubRepo(raw: unknown): GithubRepo {
	if (!raw || typeof raw !== "object") {
		throw new AppError(502, "GitHub returned a malformed repository entry")
	}
	const r = raw as Record<string, unknown>
	const id = typeof r.id === "number" ? r.id : null
	const fullName = typeof r.full_name === "string" ? r.full_name : null
	const name = typeof r.name === "string" ? r.name : null
	const htmlUrl = typeof r.html_url === "string" ? r.html_url : null
	const cloneUrl = typeof r.clone_url === "string" ? r.clone_url : null
	const defaultBranch = typeof r.default_branch === "string" ? r.default_branch : null
	const updatedAt = typeof r.pushed_at === "string" ? r.pushed_at : null
	const description = typeof r.description === "string" ? r.description : null
	const isPrivate = typeof r.private === "boolean" ? r.private : null
	if (
		id === null ||
		!fullName ||
		!name ||
		!htmlUrl ||
		!cloneUrl ||
		!defaultBranch ||
		!updatedAt ||
		isPrivate === null
	) {
		throw new AppError(502, "GitHub repository entry is missing required fields")
	}
	return {
		id,
		fullName,
		name,
		description,
		private: isPrivate,
		htmlUrl,
		cloneUrl,
		defaultBranch,
		updatedAt
	}
}
