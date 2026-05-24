import { createFileRoute, redirect } from "@tanstack/react-router"
import { orgsQueryOptions, sessionQueryOptions } from "@/lib/auth-queries"
import { routes } from "@/lib/routes"

export const Route = createFileRoute("/")({
	/**
	 * The bare `/` URL is never rendered for a signed-in user — we always
	 * redirect into their active org's projects view, so the URL bar reflects
	 * which workspace they're in. Root beforeLoad has already handled the
	 * no-session and no-orgs cases by the time we get here.
	 */
	beforeLoad: async ({ context }) => {
		const session = await context.queryClient.ensureQueryData(sessionQueryOptions)
		if (!session) throw redirect({ to: routes.signin })
		const orgs = await context.queryClient.ensureQueryData(orgsQueryOptions)
		if (orgs.length === 0) throw redirect({ to: routes.onboarding })
		const active = orgs.find((org) => org.id === session.session.activeOrganizationId) ?? orgs[0]
		if (!active) throw redirect({ to: routes.onboarding })
		throw redirect({ to: routes.projects, params: { orgSlug: active.slug } })
	}
})
