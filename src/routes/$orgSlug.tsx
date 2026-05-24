import { createFileRoute, Outlet, redirect } from "@tanstack/react-router"
import { authClient } from "@/lib/auth-client"
import { orgsQueryOptions, sessionQueryOptions } from "@/lib/auth-queries"
import { queryKeys } from "@/lib/query-keys"

export const Route = createFileRoute("/$orgSlug")({
	component: OrgLayout,
	/**
	 * Org-scope gate. Runs on every navigation into `/:orgSlug/*`:
	 *   - Verify the URL slug belongs to one of the user's organizations.
	 *     If not, bounce to their active (or first) org's projects, never
	 *     reveal that the slug exists for a different tenant.
	 *   - Make sure the URL's org matches `session.activeOrganizationId`.
	 *     If not, call `setActive` and force-refresh the cached session so
	 *     the API calls below this layout see the new active org.
	 *
	 * Membership + active-org alignment are why we have a slug in the URL at
	 * all: the URL is the source of truth, the session just follows it.
	 */
	beforeLoad: async ({ context, params }) => {
		const session = await context.queryClient.ensureQueryData(sessionQueryOptions)
		// Root beforeLoad guarantees a session by this point; defensive null check.
		if (!session) throw redirect({ to: "/signin" })

		const orgs = await context.queryClient.ensureQueryData(orgsQueryOptions)
		const target = orgs.find((org) => org.slug === params.orgSlug)

		if (!target) {
			const fallback =
				orgs.find((org) => org.id === session.session.activeOrganizationId) ?? orgs[0]
			if (!fallback) throw redirect({ to: "/onboarding" })
			throw redirect({
				to: "/$orgSlug/projects",
				params: { orgSlug: fallback.slug }
			})
		}

		if (target.id !== session.session.activeOrganizationId) {
			await authClient.organization.setActive({ organizationId: target.id })
			// `removeQueries`, not `invalidate`: ensureQueryData returns stale
			// data, so we wipe to force the next session read to fetch fresh.
			context.queryClient.removeQueries({ queryKey: queryKeys.auth.session() })
			await context.queryClient.ensureQueryData(sessionQueryOptions)
		}
	}
})

function OrgLayout() {
	return <Outlet />
}
