import { createFileRoute, redirect } from "@tanstack/react-router"
import { routes } from "@/lib/routes"

/**
 * `/$orgSlug/settings` has no content of its own — route the user to the
 * default tab so the URL is always shareable. `replace: true` keeps the
 * browser history clean (no intermediate /settings entry on back).
 */
export const Route = createFileRoute("/$orgSlug/settings/")({
	beforeLoad: ({ params }) => {
		throw redirect({
			to: routes.settingsAccount,
			params: { orgSlug: params.orgSlug },
			replace: true
		})
	}
})
