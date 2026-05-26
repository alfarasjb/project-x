import { createFileRoute } from "@tanstack/react-router"
import { authClient } from "@/lib/auth-client"

export const Route = createFileRoute("/$orgSlug/settings/account")({
	component: AccountTab
})

/**
 * Read-only profile pane — name, email, verification status. Editing
 * (password change, email change, delete account) is a follow-up; for v1
 * just surface what we already know so the tab isn't empty.
 */
function AccountTab() {
	const { data: session, isPending } = authClient.useSession()

	if (isPending) {
		return <p className="text-muted-foreground text-sm">Loading…</p>
	}
	if (!session) {
		return <p className="text-destructive text-sm">No active session.</p>
	}

	return (
		<section className="space-y-4">
			<div className="bg-card space-y-3 rounded-xl border p-4">
				<Field label="Name" value={session.user.name} />
				<Field label="Email" value={session.user.email} />
				<Field label="Email verified" value={session.user.emailVerified ? "Yes" : "No"} />
			</div>
		</section>
	)
}

function Field({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between gap-4">
			<div className="text-muted-foreground text-xs font-medium">{label}</div>
			<div className="text-sm">{value}</div>
		</div>
	)
}
