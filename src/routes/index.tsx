import { createFileRoute, Link } from "@tanstack/react-router"
import { useEffect, useState } from "react"

export const Route = createFileRoute("/")({
	component: HomePage
})

interface HealthResponse {
	status: "ok"
	mcp: { status: "stub"; transport: "stdio" }
	uptime: number
}

function HomePage() {
	const [health, setHealth] = useState<HealthResponse | null>(null)
	const [error, setError] = useState<string | null>(null)

	useEffect(() => {
		fetch("/api/health")
			.then((r) => r.json() as Promise<HealthResponse>)
			.then(setHealth)
			.catch((e: unknown) => setError(e instanceof Error ? e.message : "unknown error"))
	}, [])

	return (
		<main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6">
			<header className="text-center">
				<h1 className="font-display text-4xl font-bold tracking-tight">Project X</h1>
				<p className="text-muted-foreground mt-2 text-sm">Architectural Co-Pilot · scaffold ✓</p>
			</header>

			<section className="bg-card text-card-foreground w-full max-w-md rounded-xl border p-4">
				<h2 className="text-sm font-semibold">Backend health</h2>
				{error ? (
					<pre className="text-destructive mt-2 text-xs">error: {error}</pre>
				) : health ? (
					<pre className="mt-2 overflow-x-auto text-xs">{JSON.stringify(health, null, 2)}</pre>
				) : (
					<p className="text-muted-foreground mt-2 text-xs">loading…</p>
				)}
			</section>

			<Link
				to="/graph"
				className="text-primary text-sm font-medium underline-offset-4 hover:underline"
			>
				View the graph →
			</Link>
		</main>
	)
}
