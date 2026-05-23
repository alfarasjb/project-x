import { useState, type FormEvent } from "react"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { authClient } from "@/lib/auth-client"

export const Route = createFileRoute("/signin")({
	component: SignInPage
})

/**
 * Email + password sign-in. On success the session query is invalidated so
 * the root guard sees a logged-in user, then we navigate to `/`. The
 * better-auth client manages the cookie automatically.
 */
function SignInPage() {
	const navigate = useNavigate()
	const queryClient = useQueryClient()
	const [email, setEmail] = useState("")
	const [password, setPassword] = useState("")
	const [error, setError] = useState<string | null>(null)
	const [pending, setPending] = useState(false)

	async function handleSubmit(event: FormEvent) {
		event.preventDefault()
		setError(null)
		setPending(true)
		const result = await authClient.signIn.email({ email, password })
		setPending(false)
		if (result.error) {
			// Dump the full error for debugging — better-auth's error shapes vary.
			console.warn("[signin] error", result.error)
			const e = result.error as { message?: string | null; code?: string; status?: number }
			setError(e.message || e.code || `Sign-in failed (status ${e.status ?? "?"})`)
			return
		}
		// `removeQueries`, not `invalidate`: beforeLoad uses ensureQueryData,
		// which returns cached data even when marked stale. We need the cache
		// EMPTY so ensureQueryData is forced to fetch the post-signin session.
		queryClient.removeQueries({ queryKey: ["auth"] })
		await navigate({ to: "/" })
	}

	return (
		<AuthShell
			title="Sign in"
			subtitle="Welcome back."
			footer={
				<>
					New here?{" "}
					<Link to="/signup" className="text-foreground hover:underline">
						Create an account
					</Link>
				</>
			}
		>
			<form onSubmit={handleSubmit} className="space-y-3">
				<Field id="signin-email" label="Email">
					<input
						id="signin-email"
						type="email"
						autoComplete="email"
						required
						value={email}
						onChange={(event) => setEmail(event.target.value)}
						className={INPUT}
					/>
				</Field>
				<Field id="signin-password" label="Password">
					<input
						id="signin-password"
						type="password"
						autoComplete="current-password"
						required
						value={password}
						onChange={(event) => setPassword(event.target.value)}
						className={INPUT}
					/>
				</Field>
				{error && <p className="text-destructive text-xs">{error}</p>}
				<button type="submit" disabled={pending} className={SUBMIT}>
					{pending ? "Signing in…" : "Sign in"}
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

export function AuthShell({
	title,
	subtitle,
	footer,
	children
}: {
	title: string
	subtitle: string
	footer: React.ReactNode
	children: React.ReactNode
}) {
	return (
		<div className="bg-background flex min-h-screen items-center justify-center px-4">
			<div className="w-full max-w-sm space-y-6">
				<header className="space-y-1 text-center">
					<div className="font-display text-xl font-bold tracking-tight">Project X</div>
					<h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
					<p className="text-muted-foreground text-sm">{subtitle}</p>
				</header>
				<div className="bg-card rounded-xl border p-5">{children}</div>
				<p className="text-muted-foreground text-center text-xs">{footer}</p>
			</div>
		</div>
	)
}
