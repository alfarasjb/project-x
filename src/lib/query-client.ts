import { QueryClient } from "@tanstack/react-query"

/**
 * Shared React Query client. Created once and handed to both the
 * `QueryClientProvider` and the router context, so route loaders and component
 * hooks read the same cache.
 */
export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 30_000,
			retry: 1
		}
	}
})
