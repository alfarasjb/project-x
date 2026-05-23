import type { ReactNode } from "react"
import { Sidebar } from "./sidebar"

/**
 * The persistent app frame — a fixed left sidebar rail plus the routed content
 * area. Wraps every page; the content area is a flex column so routes can size
 * their own scroll (the graph fills, the dashboard scrolls).
 */
export function AppShell({ children }: { children: ReactNode }) {
	return (
		<div className="flex h-screen w-full overflow-hidden">
			<Sidebar />
			<main className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</main>
		</div>
	)
}
