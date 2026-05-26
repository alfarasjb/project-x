import { createFileRoute, Link, Outlet } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { routes } from "@/lib/routes"
import { cn } from "@/lib/utils"

export const Route = createFileRoute("/$orgSlug/settings")({
	component: SettingsLayout
})

/**
 * User-scoped settings — account profile, integrations (GitHub today, more
 * later). Lives under `/$orgSlug/settings` so the org shell (sidebar +
 * breadcrumb) stays consistent, even though most settings here are tied to
 * the signed-in user, not the org. Org-scoped settings (billing, member
 * management) will land as additional tabs once they exist.
 *
 * Tab navigation is route-based, not state-based: each tab is a real URL
 * (`.../settings/account`, `.../settings/integrations`) so a user can deep-
 * link directly to "Integrations" from elsewhere in the app.
 */
function SettingsLayout() {
	const { orgSlug } = Route.useParams()

	const tabLink = cn(
		"inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
		"text-muted-foreground hover:text-foreground hover:bg-muted",
		"data-[status=active]:bg-muted data-[status=active]:text-foreground"
	)

	return (
		<div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
			<div className="mx-auto w-full max-w-3xl space-y-6 px-6 py-8">
				<Link
					to={routes.projects}
					params={{ orgSlug }}
					className="text-muted-foreground hover:text-foreground hover:bg-muted inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors"
				>
					<ArrowLeft className="size-3.5" />
					Projects
				</Link>
				<header>
					<h1 className="font-display text-xl font-bold tracking-tight">Settings</h1>
					<p className="text-muted-foreground mt-1 text-sm">
						Your account profile and external integrations.
					</p>
				</header>

				<nav className="flex items-center gap-1 border-b pb-2">
					<Link to={routes.settingsAccount} params={{ orgSlug }} className={tabLink}>
						Account
					</Link>
					<Link to={routes.settingsIntegrations} params={{ orgSlug }} className={tabLink}>
						Integrations
					</Link>
				</nav>

				<Outlet />
			</div>
		</div>
	)
}
