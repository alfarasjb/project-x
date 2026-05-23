import { useState, type FormEvent } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { authClient } from "@/lib/auth-client"
import { AuthShell } from "@/routes/signin"

export const Route = createFileRoute("/signup")({
	component: SignUpPage
})

/**
 * Email + password sign-up. Three-step atomic flow:
 *   1. `signUp.email` creates the user + (via autoSignIn) issues a session
 *      cookie. The new session has activeOrganizationId = null.
 *   2. `organization.create` makes the personal workspace. Per the org
 *      plugin, this also sets the new org active on the current session
 *      (unless `keepCurrentActiveOrganization`), so by the time the call
 *      returns the session cookie carries the active org.
 *   3. Invalidate React Query's auth cache and navigate to `/`. The root
 *      beforeLoad sees a fully-formed session and lets the dashboard load.
 *
 * Doing this in the signup handler (not in the root beforeLoad / not in a
 * server-side databaseHook) is what makes it reliable: we always have a
 * real HTTP context, and the order of (sign-up → create-org → navigate) is
 * deterministic.
 */
function SignUpPage() {
	const navigate = useNavigate()
	const queryClient = useQueryClient()
	const [name, setName] = useState("")
	const [email, setEmail] = useState("")
	const [password, setPassword] = useState("")
	const [error, setError] = useState<string | null>(null)
	const [pending, setPending] = useState(false)

	async function handleSubmit(event: FormEvent) {
		event.preventDefault()
		setError(null)
		setPending(true)
		const result = await authClient.signUp.email({ name, email, password })
		setPending(false)
		if (result.error) {
			setError(result.error.message ?? "Sign-up failed")
			return
		}
		// Wipe (not invalidate) — ensureQueryData in beforeLoad returns stale
		// data, so we need an empty cache for it to fetch the new session.
		queryClient.removeQueries({ queryKey: ["auth"] })
		await navigate({ to: "/" })
	}

	return (
		<AuthShell
			title="Create your account"
			subtitle="A personal workspace will be set up for you."
			footer={
				<>
					Already have an account?{" "}
					<Link to="/signin" className="text-foreground hover:underline">
						Sign in
					</Link>
				</>
			}
		>
			<form onSubmit={handleSubmit} className="space-y-3">
				<Field id="signup-name" label="Name">
					<input
						id="signup-name"
						autoComplete="name"
						required
						value={name}
						onChange={(event) => setName(event.target.value)}
						className={INPUT}
					/>
				</Field>
				<Field id="signup-email" label="Email">
					<input
						id="signup-email"
						type="email"
						autoComplete="email"
						required
						value={email}
						onChange={(event) => setEmail(event.target.value)}
						className={INPUT}
					/>
				</Field>
				<Field id="signup-password" label="Password">
					<input
						id="signup-password"
						type="password"
						autoComplete="new-password"
						required
						minLength={8}
						value={password}
						onChange={(event) => setPassword(event.target.value)}
						className={INPUT}
					/>
					<p className="text-muted-foreground text-[11px]">At least 8 characters.</p>
				</Field>
				{error && <p className="text-destructive text-xs">{error}</p>}
				<button type="submit" disabled={pending} className={SUBMIT}>
					{pending ? "Creating account…" : "Create account"}
				</button>
			</form>
		</AuthShell>
	)
}

const INPUT =
	"w-full rounded-md border bg-background px-3 py-1.5 text-sm outline-none transition-colors focus:border-foreground/30"
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
