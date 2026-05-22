/**
 * Tenancy resolution — the seam between an incoming request and the org it
 * acts on.
 *
 * Multi-tenancy (orgs, users, auth, membership) is deliberately deferred until
 * the core product is stable. Until then this resolver "passes" unconditionally
 * and returns the single local default. When auth lands, only the body here
 * changes — the real version reads the authenticated session and verifies
 * access, and call sites keep working unchanged.
 */

/** Placeholder org id. There is no `orgs` table yet — this is just a constant. */
export const DEFAULT_ORG_ID = "00000000-0000-0000-0000-000000000001"

/**
 * Resolve the current org.
 *
 * STUB: always returns the default org id. Not yet consumed anywhere — it
 * exists so the first org-scoped feature has a seam to plug into.
 */
export function ensureDefaultOrg(): string {
	return DEFAULT_ORG_ID
}
