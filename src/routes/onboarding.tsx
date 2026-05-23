import { useState, type FormEvent } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { authClient } from "@/lib/auth-client"
import { AuthShell } from "@/routes/signin"

export const Route = createFileRoute("/onboarding")({
	component: OnboardingPage
})

/**
 * First-org onboarding — shown after a fresh sign-up (or any sign-in by a
 * user who has no organizations yet). Creating the org also sets it active
 * on the session, so the next navigation lands in the dashboard.
 *
 * Name + slug start as a sensible default derived from the user's display
 * name, but the user can edit either before submitting — that's the whole
 * point of routing through this page instead of auto-creating server-side.
 */
function OnboardingPage() {
	const navigate = useNavigate()
	const queryClient = useQueryClient()
	const { data: session, isPending: sessionLoading } = authClient.useSession()

	const defaultName = session?.user.name ? `${session.user.name.split(" ")[0]}'s Workspace` : ""
	const defaultSlug = session?.user.email ? slugify(session.user.email.split("@")[0] ?? "") : ""

	const [name, setName] = useState(defaultName)
	const [slug, setSlug] = useState(defaultSlug)
	const [touchedSlug, setTouchedSlug] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [pending, setPending] = useState(false)

	// First render may load before session resolves — once it does, hydrate
	// the inputs (only if the user hasn't typed yet).
	if (!touchedSlug && !slug && defaultSlug) setSlug(defaultSlug)
	if (!name && defaultName) setName(defaultName)

	async function handleSubmit(event: FormEvent) {
		event.preventDefault()
		setError(null)
		setPending(true)
		const newSlug = slug.trim()
		const result = await authClient.organization.create({ name: name.trim(), slug: newSlug })
		setPending(false)
		if (result.error) {
			console.warn("[onboarding] error", result.error)
			const e = result.error
			setError(e.message || `Could not create workspace (status ${e.status ?? "?"})`)
			return
		}
		// Wipe both session AND orgs caches so beforeLoads re-fetch and see
		// the new active org + the new entry in the org list.
		queryClient.removeQueries({ queryKey: ["auth"] })
		// Navigate straight into the new workspace by its slug — `organization.create`
		// already set it active server-side, so the org-slug gate will pass.
		await navigate({
			to: "/$orgSlug/projects",
			params: { orgSlug: result.data?.slug ?? newSlug }
		})
	}

	function handleNameChange(value: string) {
		setName(value)
		if (!touchedSlug) {
			setSlug(slugify(value))
		}
	}

	return (
		<AuthShell
			title="Create your workspace"
			subtitle="One last step. You can rename or invite teammates later."
			footer={<>You can always create more workspaces from settings.</>}
		>
			<form onSubmit={handleSubmit} className="space-y-3">
				<Field id="onboarding-name" label="Workspace name">
					<input
						id="onboarding-name"
						required
						value={name}
						onChange={(event) => handleNameChange(event.target.value)}
						className={INPUT}
						disabled={sessionLoading}
					/>
				</Field>
				<Field id="onboarding-slug" label="Workspace slug">
					<input
						id="onboarding-slug"
						required
						pattern="[a-z0-9-]+"
						value={slug}
						onChange={(event) => {
							setTouchedSlug(true)
							setSlug(event.target.value.toLowerCase())
						}}
						className={`${INPUT} font-mono text-xs`}
						disabled={sessionLoading}
					/>
					<p className="text-muted-foreground text-[11px]">
						Lowercase letters, numbers, and dashes. Used in URLs and APIs.
					</p>
				</Field>
				{error && <p className="text-destructive text-xs">{error}</p>}
				<button type="submit" disabled={pending || !name.trim() || !slug.trim()} className={SUBMIT}>
					{pending ? "Creating workspace…" : "Create workspace"}
				</button>
			</form>
		</AuthShell>
	)
}

function slugify(value: string): string {
	return (
		value
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-+|-+$/g, "") || "workspace"
	)
}

const INPUT =
	"w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none transition-colors focus:border-foreground/30 disabled:opacity-50"
const SUBMIT =
	"bg-primary text-primary-foreground w-full rounded-md px-3 py-2 text-xs font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
	return (
		<div className="space-y-1">
			<label htmlFor={id} className="text-xs font-medium">
				{label}
			</label>
			{children}
		</div>
	)
}
