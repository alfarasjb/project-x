import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { organization } from "better-auth/plugins"
import { env } from "@server/env"
import { getDb } from "@server/db"
import { dash } from "@better-auth/infra"

/**
 * Better-auth server config.
 *
 * - Drizzle adapter against our single pg connection. Schema is implicit:
 *   the adapter introspects the `db` instance, which already has every
 *   auth/org/domain table registered in `server/db/index.ts`.
 * - Email + password is the only sign-in method for now; OAuth providers can
 *   be appended without touching schema.
 * - The Organization plugin gives us `organization` / `member` / `invitation`
 *   tables, `activeOrganizationId` on session, and the create/invite/accept
 *   APIs both server- and client-side.
 * - Personal-org creation is deliberately NOT done here as a databaseHook.
 *   `auth.api.createOrganization` called inside `user.create.after` runs
 *   without an HTTP context, which can silently no-op (the user row commits
 *   but the org/member rows don't). The web client handles it instead in
 *   `__root.tsx` beforeLoad — guaranteed HTTP context, single source of
 *   truth for "ensure this signed-in user has an active org."
 * - `sendInvitationEmail` is a console.log stub for dev. Wire a real provider
 *   (Resend etc.) before public invites ship.
 */
export const auth = betterAuth({
	baseURL: env.BETTER_AUTH_URL,
	secret: env.BETTER_AUTH_API_KEY,
	trustedOrigins: [env.APP_URL],

	database: drizzleAdapter(getDb(), { provider: "pg" }),

	emailAndPassword: {
		enabled: true,
		// We don't ship email verification yet — flip when we have an email provider.
		requireEmailVerification: false,
		autoSignIn: true,
		minPasswordLength: 8
	},

	/**
	 * Account-linking gates which providers may attach to an existing user via
	 * `linkSocial`. By default better-auth rejects unknown providers with
	 * `unable_to_link_account` — we explicitly trust GitHub here because the
	 * integration uses linking as an authorization step (storing a per-user
	 * GitHub OAuth token), not as a sign-in identity.
	 *
	 * `allowDifferentEmails: true` because the user's app account (email/pw)
	 * and their GitHub account are independent identities — we don't require
	 * `alice@personal.com` to also be the email on `alice`'s GitHub.
	 */
	account: {
		/**
		 * OAuth state goes in an encrypted cookie on this server's origin —
		 * NOT the `verification` table. The DB strategy was reliably failing
		 * the callback's state lookup ("verification not found") and never
		 * persisting the new account row's scope, so the integration UI kept
		 * reflecting the empty-scope row from the original link. Cookie
		 * round-trips with the OAuth redirect from GitHub back to Fastify
		 * (same-origin), no DB read/write race, no cleanup hook to fight with.
		 */
		storeStateStrategy: "cookie",
		accountLinking: {
			enabled: true,
			trustedProviders: ["github"],
			allowDifferentEmails: true
		}
	},

	/**
	 * GitHub OAuth — registered only when the OAuth-app credentials are
	 * configured. The integration UI is the only consumer; sign-in via GitHub
	 * is implicitly supported by better-auth (same provider config powers both
	 * `signIn.social` and `linkSocial`).
	 *
	 * Scope `repo` covers private + public repos and is what we need to clone
	 * later; `read:user` lets us pull the user's GitHub login for display.
	 * Tokens land in the better-auth `account` table; read them via the
	 * `github` domain helpers, not directly.
	 */
	socialProviders:
		env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
			? {
					github: {
						clientId: env.GITHUB_CLIENT_ID,
						clientSecret: env.GITHUB_CLIENT_SECRET,
						scope: ["repo", "read:user"]
					}
				}
			: undefined,

	session: {
		expiresIn: 60 * 60 * 24 * 7, // 7 days
		updateAge: 60 * 60 * 24 // refresh sliding window once per day
		// cookieCache deliberately OFF for now. It encodes the session into the
		// auth cookie itself and only refreshes on a short cadence — which
		// silently masks DB updates like `organization.setActive`: the DB has
		// the new activeOrganizationId, but `getSession` keeps returning the
		// stale cached blob until the cache expires. Re-enable once we have a
		// reliable cache-refresh point (e.g. invalidate on every org mutation).
	},

	plugins: [
		organization({
			allowUserToCreateOrganization: true,
			creatorRole: "owner",
			membershipLimit: 100,
			invitationExpiresIn: 60 * 60 * 48, // 48 hours
			async sendInvitationEmail(data) {
				// Dev stub — log the accept URL so we can copy/paste it locally.
				// Replace with a real email provider before invites ship publicly.
				const acceptUrl = `${env.APP_URL}/accept-invitation/${data.id}`
				console.warn(
					`[invite] ${data.inviter.user.email} invited ${data.email} ` +
						`to ${data.organization.name} (${data.role}) — accept at ${acceptUrl}`
				)
			}
		}),
		dash()
	]
})

export type Auth = typeof auth
