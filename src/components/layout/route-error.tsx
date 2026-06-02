import { Link } from "@tanstack/react-router"
import { routes } from "@/lib/routes"
import { errorMessage } from "@/lib/toast"

/**
 * Generic error page — rendered by TanStack Router's root `errorComponent`
 * when a route loader (or descendant component) throws an unhandled error.
 *
 * Two affordances: reload (transient failures) and a way out (link home).
 * The technical detail is collapsed by default — most users don't care, but
 * the dev who hits this in a screen-share does.
 */
export function RouteErrorPage({ error }: { error: unknown }) {
	return (
		<div className="bg-background flex min-h-[60vh] items-center justify-center p-6">
			<div className="max-w-md space-y-4 text-center">
				<div>
					<h1 className="font-display text-2xl font-bold tracking-tight">Something went wrong</h1>
					<p className="text-muted-foreground mt-1 text-sm">
						The page hit an error we didn&apos;t expect. Reloading often fixes it.
					</p>
				</div>
				<div className="flex items-center justify-center gap-2">
					<button
						type="button"
						onClick={() => window.location.reload()}
						className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90"
					>
						Reload
					</button>
					<Link
						to={routes.home}
						className="hover:bg-muted rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
					>
						Go home
					</Link>
				</div>
				<details className="text-muted-foreground mt-4 text-left text-[11px]">
					<summary className="hover:text-foreground cursor-pointer transition-colors">
						Technical detail
					</summary>
					<pre className="bg-muted mt-2 overflow-auto rounded-none p-2 font-mono whitespace-pre-wrap">
						{errorMessage(error, "Unknown error")}
					</pre>
				</details>
			</div>
		</div>
	)
}

/**
 * 404 page — rendered when a route loader throws `notFound()` (e.g. the
 * project-by-slug loader can't find a matching slug in the active org), or
 * when no route matches the URL at all.
 *
 * Separate from `RouteErrorPage` because "this thing doesn't exist" reads
 * differently from "something broke." Same shell shape so layouts stay
 * predictable.
 */
export function RouteNotFoundPage() {
	return (
		<div className="bg-background flex min-h-[60vh] items-center justify-center p-6">
			<div className="max-w-md space-y-4 text-center">
				<div>
					<h1 className="font-display text-2xl font-bold tracking-tight">Not found</h1>
					<p className="text-muted-foreground mt-1 text-sm">
						The page you were looking for doesn&apos;t exist, or you don&apos;t have access to it.
					</p>
				</div>
				<div className="flex items-center justify-center gap-2">
					<Link
						to={routes.home}
						className="bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-90"
					>
						Go home
					</Link>
				</div>
			</div>
		</div>
	)
}
