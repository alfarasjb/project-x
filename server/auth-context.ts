import { fromNodeHeaders } from "better-auth/node"
import type { FastifyRequest } from "fastify"
import { auth } from "@server/auth"
import { AppError } from "@server/utils/errors"

/**
 * Auth-context helpers — the bridge between an incoming Fastify request and
 * better-auth's session state. This is the only place routes / domain code
 * should read the session from; never reach into `request.headers` directly.
 *
 * Every helper throws an `AppError` on failure so the boundary error handler
 * produces a clean JSON response with the right status.
 */

export interface AuthContext {
	userId: string
	organizationId: string
}

/**
 * Resolve the active session + active organization for the current request.
 * Throws 401 when there's no session, 400 when there's a session but no
 * active org (which means the personal-org auto-create hook failed — should
 * never happen in practice, but we surface it cleanly rather than 500'ing).
 */
export async function requireAuth(request: FastifyRequest): Promise<AuthContext> {
	const session = await auth.api.getSession({
		headers: fromNodeHeaders(request.headers)
	})
	if (!session) {
		throw new AppError(401, "Sign-in required")
	}
	const organizationId = session.session.activeOrganizationId
	if (!organizationId) {
		throw new AppError(400, "No active organization for this session")
	}
	return { userId: session.user.id, organizationId }
}
