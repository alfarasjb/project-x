import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { authClient } from "@/lib/auth-client"
import { GitHubMark } from "@/components/icons/github-mark"
import { useDisconnectGithub } from "@/hooks/use-disconnect-github"
import { githubStatusQueryOptions } from "@/lib/queries"
import { routes } from "@/lib/routes"
import { toast, toastError } from "@/lib/toast"
import { Button } from "@/components/ui/button"

export const Route = createFileRoute("/$orgSlug/settings/integrations")({
	component: IntegrationsTab,
	loader: ({ context }) => {
		void context.queryClient.prefetchQuery(githubStatusQueryOptions())
	}
})

/**
 * Integrations tab — one card per external service. GitHub is the only one
 * today (Connect / Disconnect + show the connected login). Future
 * integrations slot in as additional cards underneath.
 *
 * Connect calls better-auth's `linkSocial` which redirects the browser to
 * GitHub's OAuth consent; on success the user lands back here via the
 * `callbackURL`. We invalidate the status query on that return so the UI
 * reflects the new state.
 */
function IntegrationsTab() {
	const { orgSlug } = Route.useParams()
	const { data: status, isPending } = useQuery(githubStatusQueryOptions())

	if (isPending || !status) {
		return <p className="text-muted-foreground text-sm">Loading…</p>
	}

	return (
		<section className="space-y-4">
			<GithubCard
				orgSlug={orgSlug}
				configured={status.configured}
				connected={status.connected}
				login={status.login}
				scope={status.scope}
			/>
		</section>
	)
}

interface GithubCardProps {
	orgSlug: string
	configured: boolean
	connected: boolean
	login: string | null
	scope: string | null
}

const REQUIRED_SCOPE = "repo"

function GithubCard({ orgSlug, configured, connected, login, scope }: GithubCardProps) {
	const [linking, setLinking] = useState(false)

	// Absolute URL against the browser origin (Vite in dev, app origin in
	// prod) so better-auth's redirect after OAuth lands on the SPA, not on
	// Fastify's `BETTER_AUTH_URL` (which only serves /api/*).
	const callbackPath = routes.settingsIntegrations.replace("$orgSlug", orgSlug)
	const callbackURL = `${window.location.origin}${callbackPath}`

	async function handleConnect(): Promise<void> {
		setLinking(true)
		try {
			const result = await authClient.linkSocial({
				provider: "github",
				callbackURL,
				// Re-request explicitly each time so a user who initially linked
				// without `repo` can escalate by re-running the connect flow.
				scopes: ["repo", "read:user"]
			})
			if (result.error) {
				toastError(
					new Error(result.error.message ?? "Failed to start GitHub OAuth flow"),
					"Couldn't connect GitHub."
				)
				setLinking(false)
			}
			// On success the browser redirects to GitHub — no follow-up here.
		} catch (cause) {
			toastError(cause, "Couldn't connect GitHub.")
			setLinking(false)
		}
	}

	const { mutate: disconnect, isPending: disconnecting } = useDisconnectGithub()
	const handleDisconnect = (): void => {
		disconnect(undefined, {
			onSuccess: () => toast.success("GitHub disconnected."),
			onError: (cause) => toastError(cause, "Disconnect failed.")
		})
	}

	return (
		<div className="bg-card space-y-3 rounded-xl border p-4">
			<div className="flex items-start gap-3">
				<div className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-md">
					<GitHubMark className="size-5" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<h3 className="text-sm font-semibold">GitHub</h3>
						{connected && (
							<span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded px-1.5 py-0.5 text-[10px] font-medium">
								Connected
							</span>
						)}
					</div>
					<p className="text-muted-foreground mt-0.5 text-xs">
						Import repositories from GitHub and let Project X clone them at crawl time. Requires{" "}
						<code className="bg-muted rounded px-1 py-0.5 text-[10px]">repo</code> scope.
					</p>
					{connected && login && (
						<p className="text-muted-foreground mt-2 text-xs">
							Signed in as <span className="text-foreground font-medium">@{login}</span>
						</p>
					)}
					{connected && scope && (
						<p className="text-muted-foreground mt-1 text-[11px]">
							Scopes: <span className="font-mono">{scope.split(",").join(", ") || "(none)"}</span>
						</p>
					)}
				</div>
			</div>

			{connected && scope !== null && !scope.split(",").includes(REQUIRED_SCOPE) && (
				<div className="bg-amber-500/10 text-amber-700 dark:text-amber-300 rounded-md border border-amber-500/30 p-3 text-xs">
					Stored token is missing the <code className="font-mono">repo</code> scope, so private
					repositories won&apos;t appear in the import list. Disconnect and reconnect to grant it.
				</div>
			)}

			{!configured && (
				<div className="bg-amber-500/10 text-amber-700 dark:text-amber-300 rounded-md border border-amber-500/30 p-3 text-xs">
					GitHub OAuth credentials are not configured on this server. Ask an admin to set{" "}
					<code className="font-mono">GITHUB_CLIENT_ID</code> and{" "}
					<code className="font-mono">GITHUB_CLIENT_SECRET</code>.
				</div>
			)}

			<div className="flex justify-end">
				{connected ? (
					<Button
						type="button"
						variant="outline"
						onClick={handleDisconnect}
						disabled={disconnecting}
					>
						{disconnecting ? "Disconnecting…" : "Disconnect"}
					</Button>
				) : (
					<Button type="button" onClick={handleConnect} disabled={!configured || linking}>
						{linking ? "Redirecting…" : "Connect GitHub"}
					</Button>
				)}
			</div>
		</div>
	)
}
