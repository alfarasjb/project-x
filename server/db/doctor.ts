import { eq } from "drizzle-orm"
import { getDb } from "@server/db"
import { account, member, organization, session, user } from "@server/db/schema/auth"

/**
 * Auth-doctor — dump the auth state for one email so we can see exactly what
 * the seed (or a real signup) wrote into Postgres. The most common dev
 * failure mode is "user row exists but no credential account row," which
 * silently breaks sign-in.
 *
 * Run with: `pnpm tsx --tsconfig tsconfig.server.json server/db/doctor.ts dev@local.test`
 */
const email = process.argv[2] ?? "dev@local.test"

const db = getDb()
const [u] = await db.select().from(user).where(eq(user.email, email)).limit(1)
if (!u) {
	console.warn(`[doctor] no user row for ${email}`)
	process.exit(0)
}

const accounts = await db.select().from(account).where(eq(account.userId, u.id))
const sessions = await db.select().from(session).where(eq(session.userId, u.id))
const memberships = await db.select().from(member).where(eq(member.userId, u.id))

console.warn(`[doctor] user`, { id: u.id, name: u.name, email: u.email })
console.warn(
	`[doctor] accounts (${accounts.length})`,
	accounts.map((a) => ({
		id: a.id,
		providerId: a.providerId,
		accountId: a.accountId,
		hasPassword: !!a.password,
		passwordLen: a.password?.length ?? 0
	}))
)
console.warn(
	`[doctor] sessions (${sessions.length})`,
	sessions.map((s) => ({
		id: s.id,
		expiresAt: s.expiresAt,
		activeOrganizationId: s.activeOrganizationId
	}))
)
console.warn(
	`[doctor] memberships (${memberships.length})`,
	memberships.map((m) => ({ orgId: m.organizationId, role: m.role }))
)

const firstMembership = memberships[0]
if (firstMembership) {
	const orgs = await db
		.select()
		.from(organization)
		.where(eq(organization.id, firstMembership.organizationId))
	console.warn(`[doctor] orgs`, orgs)
}

process.exit(0)
