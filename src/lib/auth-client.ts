import { createAuthClient } from "better-auth/react"
import { organizationClient } from "better-auth/client/plugins"

/**
 * Better-auth React client. `baseURL` is omitted — the client defaults to
 * the current origin, which in dev is the Vite dev server (5173); Vite's
 * `/api` proxy forwards `/api/auth/*` to Fastify (3100), so everything is
 * same-origin from the browser's POV (no third-party-cookie concerns).
 *
 * **Why the manual type:** better-auth's inferred client type references
 * internal sub-paths of the package (`better-auth/dist/plugins/access/...`,
 * `.../client/query.mjs`, ...) that `tsc --declaration` cannot portably
 * write into a `.d.ts` file — this project compiles `composite: true`, which
 * forces declaration emit and so trips TS2883 on the auto-inferred client.
 * The fix is to give `authClient` an explicit narrow surface that only
 * exposes the operations we actually use; the cast is the seam where the
 * unportable inferred types stop and our portable surface begins.
 */

export interface AuthUser {
	id: string
	name: string
	email: string
	emailVerified: boolean
	image?: string | null
}

export interface AuthSession {
	user: AuthUser
	session: {
		id: string
		userId: string
		expiresAt: Date | string
		activeOrganizationId: string | null
	}
}

export interface AuthOrganization {
	id: string
	name: string
	slug: string
}

export interface AuthError {
	message?: string | null
	status?: number
}

export interface AuthResult<T = unknown> {
	data: T | null
	error: AuthError | null
}

interface AuthClient {
	signIn: {
		email(args: { email: string; password: string }): Promise<AuthResult>
	}
	signUp: {
		email(args: { name: string; email: string; password: string }): Promise<AuthResult>
	}
	signOut(): Promise<AuthResult>
	useSession(): { data: AuthSession | null; isPending: boolean }
	useActiveOrganization(): { data: AuthOrganization | null; isPending: boolean }
	getSession(): Promise<AuthResult<AuthSession>>
	organization: {
		list(): Promise<AuthResult<AuthOrganization[]>>
		create(args: { name: string; slug: string }): Promise<AuthResult<AuthOrganization>>
		setActive(args: { organizationId: string }): Promise<AuthResult<AuthOrganization>>
	}
}

export const authClient = createAuthClient({
	plugins: [organizationClient()]
}) as unknown as AuthClient
