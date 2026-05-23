import { queryOptions } from "@tanstack/react-query"
import { authClient, type AuthOrganization } from "@/lib/auth-client"

/**
 * Session as a React Query — lets route loaders pre-fetch it via
 * `ensureQueryData` and components read it via `useQuery`. The query key
 * doubles as the cache slot the sign-in/sign-out mutations invalidate.
 *
 * `staleTime` is short — auth state can change out from under us (sign-out
 * in another tab, server-side revocation) so a stale read should refresh
 * within a minute.
 */
export const sessionQueryOptions = queryOptions({
	queryKey: ["auth", "session"],
	queryFn: async () => {
		const { data } = await authClient.getSession()
		return data ?? null
	},
	staleTime: 60_000
})

/**
 * The current user's organizations. Cached so the root beforeLoad and the
 * `$orgSlug` layout beforeLoad don't each issue their own request on every
 * navigation. Mutations (create-org, leave-org, invite-accept) should
 * `queryClient.removeQueries({ queryKey: ['auth', 'orgs'] })` after.
 */
export const orgsQueryOptions = queryOptions({
	queryKey: ["auth", "orgs"],
	queryFn: async (): Promise<AuthOrganization[]> => {
		const { data } = await authClient.organization.list()
		return data ?? []
	},
	staleTime: 60_000
})
