import { createRootRouteWithContext, Outlet, redirect, useLocation } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import type { QueryClient } from "@tanstack/react-query"
import { authClient } from "@/lib/auth-client"
import { sessionQueryOptions } from "@/lib/auth-queries"
import { projectsQueryOptions } from "@/lib/queries"
import { AppShell } from "@/components/layout/app-shell"

/** Router context — shared with every route loader. */
export interface RouterContext {
	queryClient: QueryClient
}

/** Routes that don't require a session at all (sign-in / sign-up). */
const ANONYMOUS_ROUTES = new Set(["/signin", "/signup"])

/**
 * Routes that require a session but do NOT require an active org. The
 * onboarding page lives here: a fresh user has no org yet, and this is
 * where they create one.
 */
const NO_ORG_ROUTES = new Set(["/onboarding"])

/**
 * Routes that render WITHOUT the AppShell (sidebar + header). The shell
 * assumes a workspace context, so anything pre-org renders bare.
 */
const BARE_LAYOUT_ROUTES = new Set([...ANONYMOUS_ROUTES, ...NO_ORG_ROUTES])

export const Route = createRootRouteWithContext<RouterContext>()({
	component: RootLayout,
	/**
	 * Three-zone routing:
	 *   ANONYMOUS (signin/signup):   no session required
	 *   NO_ORG (onboarding):         session required, NO org required
	 *   APP (everything else):       session + active org required
	 *
	 * The gate routes the user into the correct zone for their state:
	 *   no session     → /signin       (unless already on an ANONYMOUS route)
	 *   session, 0 orgs → /onboarding   (unless already on /onboarding)
	 *   session, has orgs but on signin/signup or /onboarding → /
	 *   session, has orgs, no active org → setActive(first) and continue
	 */
	beforeLoad: async ({ context, location }) => {
		const session = await context.queryClient.ensureQueryData(sessionQueryOptions)
		const path = location.pathname
		const isAnonymous = ANONYMOUS_ROUTES.has(path)
		const isOnboarding = NO_ORG_ROUTES.has(path)

		if (!session) {
			if (isAnonymous) return
			throw redirect({ to: "/signin" })
		}

		// Signed in — never let them sit on signin/signup.
		if (isAnonymous) {
			throw redirect({ to: "/" })
		}

		// Need to know whether they have any orgs to decide between onboarding
		// and the app proper. One extra request on first nav, then cached.
		const orgList = await authClient.organization.list()
		const orgs = orgList.data ?? []

		if (orgs.length === 0) {
			if (isOnboarding) return
			throw redirect({ to: "/onboarding" })
		}

		// Has orgs — onboarding is a dead-end for them.
		if (isOnboarding) {
			throw redirect({ to: "/" })
		}

		// Ensure ONE of the user's orgs is active. New sessions land here with
		// activeOrganizationId = null even if the user has memberships
		// (sign-in doesn't auto-pick an org); pick the first.
		if (!session.session.activeOrganizationId) {
			const first = orgs[0]
			if (first) {
				await authClient.organization.setActive({ organizationId: first.id })
				await context.queryClient.invalidateQueries({ queryKey: ["auth"] })
				await context.queryClient.ensureQueryData(sessionQueryOptions)
			}
		}
	},
	loader: ({ context, location }) => {
		// Only prefetch the project list when the user is past onboarding —
		// otherwise the request would 400 with "no active organization".
		if (BARE_LAYOUT_ROUTES.has(location.pathname)) return
		void context.queryClient.prefetchQuery(projectsQueryOptions())
	}
})

function RootLayout() {
	const { pathname } = useLocation()
	const bare = BARE_LAYOUT_ROUTES.has(pathname)

	return (
		<div className="bg-background text-foreground">
			{bare ? (
				<Outlet />
			) : (
				<AppShell>
					<Outlet />
				</AppShell>
			)}
			{import.meta.env.DEV && (
				<>
					<TanStackRouterDevtools position="bottom-right" />
					<ReactQueryDevtools buttonPosition="bottom-left" />
				</>
			)}
		</div>
	)
}
