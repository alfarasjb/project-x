import { createRootRouteWithContext, Outlet, redirect, useLocation } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import type { QueryClient } from "@tanstack/react-query"
import { orgsQueryOptions, sessionQueryOptions } from "@/lib/auth-queries"
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
	 * Auth zone gate. Org-membership and active-org tracking happen in the
	 * `/$orgSlug` layout — here we only decide which zone the user belongs in:
	 *   - no session                                → /signin
	 *   - session but on signin/signup              → /          (index redirects to org)
	 *   - session, zero orgs                         → /onboarding
	 *   - session, has orgs, but on /onboarding     → /          (index redirects to org)
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

		// One source of truth for "do I have any orgs?" — cached so the
		// `$orgSlug` beforeLoad below doesn't re-fetch.
		const orgs = await context.queryClient.ensureQueryData(orgsQueryOptions)

		if (orgs.length === 0) {
			if (isOnboarding) return
			throw redirect({ to: "/onboarding" })
		}

		// Has orgs — onboarding is a dead-end for them.
		if (isOnboarding) {
			throw redirect({ to: "/" })
		}
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
