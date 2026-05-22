import { createRootRouteWithContext, Outlet } from "@tanstack/react-router"
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import type { QueryClient } from "@tanstack/react-query"

/** Router context — shared with every route loader. */
export interface RouterContext {
	queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
	component: RootLayout
})

function RootLayout() {
	return (
		<div className="min-h-screen bg-background text-foreground">
			<Outlet />
			{import.meta.env.DEV && (
				<>
					<TanStackRouterDevtools position="bottom-right" />
					<ReactQueryDevtools buttonPosition="bottom-left" />
				</>
			)}
		</div>
	)
}
