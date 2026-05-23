import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import type { QueryClient } from "@tanstack/react-query"
import { projectsQueryOptions } from "@/lib/queries"
import { AppShell } from "@/components/layout/app-shell"

/** Router context — shared with every route loader. */
export interface RouterContext {
	queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
	component: RootLayout,
	loader: ({ context }) => {
		// Warm the project list the sidebar renders on every page.
		void context.queryClient.prefetchQuery(projectsQueryOptions())
	}
})

function RootLayout() {
	return (
		<div className="bg-background text-foreground">
			<AppShell>
				<Outlet />
			</AppShell>
			{import.meta.env.DEV && (
				<>
					<TanStackRouterDevtools position="bottom-right" />
					<ReactQueryDevtools buttonPosition="bottom-left" />
				</>
			)}
		</div>
	)
}
