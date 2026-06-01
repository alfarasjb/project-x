import type { FastifyInstance } from "fastify"
import { apiRoutePatterns } from "@shared/api-routes"
import { AppError } from "@server/utils/errors"
import { requireAuth } from "@server/auth-context"
import { getFeatureFlow, listFeatureFlows } from "@server/domain/feature-flow"

/**
 * Feature flow routes — read-side only, scoped to the active org via the
 * owning project. An unknown or cross-org project returns 404 (not 403) so
 * project ids don't leak across tenants, matching the project endpoints.
 *
 * Write-side (create/update) is intentionally absent: flows are produced by
 * the seed today and by the ARG-11 agent later — the agent is the create
 * surface, so there's no manual-create REST route yet.
 */
export async function featureFlowRoutes(app: FastifyInstance): Promise<void> {
	app.get<{ Params: { id: string } }>(apiRoutePatterns.projectFeatureFlows, async (request) => {
		const { organizationId } = await requireAuth(request)
		const flows = await listFeatureFlows(request.params.id, organizationId)
		if (!flows) throw new AppError(404, `Project not found: ${request.params.id}`)
		return flows
	})

	app.get<{ Params: { id: string; flowSlug: string } }>(
		apiRoutePatterns.projectFeatureFlow,
		async (request) => {
			const { organizationId } = await requireAuth(request)
			const flow = await getFeatureFlow(request.params.id, request.params.flowSlug, organizationId)
			if (!flow) {
				throw new AppError(404, `Feature flow not found: ${request.params.flowSlug}`)
			}
			return flow
		}
	)
}
