import { useMutation, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { apiRoutes } from "@shared/api-routes"
import { apiPost } from "@/lib/api"
import { queryKeys } from "@/lib/query-keys"

const DisconnectResultSchema = z.object({ disconnected: z.literal(true) })

/**
 * Disconnect GitHub — revokes the OAuth grant on GitHub's side and drops
 * the local account row. Server-side detail matters: revoke-then-unlink
 * prevents the next Connect from silently re-issuing a token with the
 * old (narrower) scope set.
 *
 * Cache contract: invalidate the github status query so the integrations
 * card flips to the disconnected state.
 */
export function useDisconnectGithub() {
	const queryClient = useQueryClient()
	return useMutation({
		mutationFn: () => apiPost(apiRoutes.integrationGithubDisconnect, DisconnectResultSchema),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: queryKeys.integrations.github() })
		}
	})
}
