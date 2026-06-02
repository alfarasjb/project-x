import { and, eq } from "drizzle-orm"
import { auth } from "@server/auth"
import { getDb } from "@server/db"
import { account, member, organization } from "@server/db/schema/auth"

/**
 * Dev seed — one deterministic account + personal org so a fresh DB wipe +
 * migrate + `pnpm db:seed` lands you in a usable, signable-in state without
 * going through the signup form.
 *
 * Why not `auth.api.signUpEmail` (the old approach): the public API expects an
 * HTTP context (headers/request). Called from this one-shot script it returned
 * without throwing AND wrote the `user` row, but never persisted the credential
 * `account` row — so sign-in failed with a silent "Invalid credentials" (ARG-8).
 *
 * What we do instead: drive the credential write through better-auth's own
 * internal adapter via `auth.$context` — the exact same `createUser` +
 * `linkAccount` calls the real sign-up route runs, with no HTTP context needed
 * (see better-auth's sign-up route). The password is hashed by better-auth's
 * own hasher (`ctx.password.hash`), so the stored hash is byte-identical to a
 * form signup and `ctx.password.verify` accepts it. The org + owner membership
 * are plain drizzle inserts (no crypto involved); their unique constraints make
 * re-runs idempotent.
 *
 * Idempotent + self-repairing: each table is ensured independently, so a re-run
 * against a half-seeded DB (e.g. a user row left over from the old broken seed,
 * with no account) back-fills the missing credential/org/member rows rather than
 * skipping everything.
 *
 * Run with: `pnpm db:seed`
 *   → email:    dev@local.test
 *   → password: password1234
 *   → org:      Dev Workspace (slug: dev)
 */
const DEV_USER = {
	name: "Dev",
	email: "dev@local.test",
	password: "password1234"
} as const

const DEV_ORG = {
	name: "Dev Workspace",
	slug: "dev"
} as const

/** better-auth's provider id for email/password accounts (see its sign-up route). */
const CREDENTIAL_PROVIDER_ID = "credential"

type AuthContext = Awaited<typeof auth.$context>

/**
 * Attach the dev password to `userId` as a credential account — the same write
 * better-auth's sign-up route performs (`linkAccount` with the `credential`
 * provider and `accountId === userId`), hashed by better-auth's own hasher so
 * sign-in accepts it. Runnable without an HTTP context, which is the whole point.
 */
async function linkDevCredential(ctx: AuthContext, userId: string): Promise<void> {
	const hash = await ctx.password.hash(DEV_USER.password)
	await ctx.internalAdapter.linkAccount({
		userId,
		providerId: CREDENTIAL_PROVIDER_ID,
		accountId: userId,
		password: hash
	})
}

async function main(): Promise<void> {
	const db = getDb()
	const ctx = await auth.$context

	// ── 1. User + credential account (better-auth's own internal adapter) ──────
	const existing = await ctx.internalAdapter.findUserByEmail(DEV_USER.email, {
		includeAccounts: true
	})

	let userId: string
	if (existing) {
		userId = existing.user.id
		const hasCredential = existing.accounts.some((acc) => acc.providerId === CREDENTIAL_PROVIDER_ID)
		if (!hasCredential) {
			// Half-seeded DB (user without credential — the exact ARG-8 symptom): repair it.
			await linkDevCredential(ctx, userId)
			console.warn(`[seed] back-filled missing credential for ${DEV_USER.email} (id=${userId}).`)
		} else {
			console.warn(
				`[seed] ${DEV_USER.email} already has a credential (id=${userId}) — skipping user.`
			)
		}
	} else {
		const createdUser = await ctx.internalAdapter.createUser({
			name: DEV_USER.name,
			email: DEV_USER.email,
			emailVerified: false
		})
		userId = createdUser.id
		await linkDevCredential(ctx, userId)
		console.warn(`[seed] created ${DEV_USER.email} (id=${userId}).`)
	}

	// ── 2 & 3. Personal org + owner membership ─────────────────────────────────
	// One transaction so we never persist an org without its owner member (a
	// broken, inaccessible workspace). This tx guarantees org↔member only — the
	// user + credential writes in step 1 run separately (better-auth's internal
	// adapter, not transactable through this `tx` handle), so a crash between
	// steps 1 and 2 can leave a user with no org; the idempotent rerun back-fills
	// it. Each insert is idempotent on its own unique index — organization.slug
	// and member (organizationId, userId) — so a re-run is a no-op. `id` is a
	// fresh UUID each run, so the PK never collides; the only reachable conflict
	// is the intended idempotency key.
	await db.transaction(async (tx) => {
		await tx
			.insert(organization)
			.values({ id: crypto.randomUUID(), name: DEV_ORG.name, slug: DEV_ORG.slug })
			.onConflictDoNothing()

		const [org] = await tx
			.select({ id: organization.id })
			.from(organization)
			.where(eq(organization.slug, DEV_ORG.slug))
			.limit(1)
		if (!org)
			throw new Error(`[seed] org "${DEV_ORG.slug}" missing after upsert — cannot continue.`)

		await tx
			.insert(member)
			.values({ id: crypto.randomUUID(), organizationId: org.id, userId, role: "owner" })
			.onConflictDoNothing()
	})

	// ── 4. Verify the seeded credential is actually sign-in-able ──────────────
	// Same check better-auth's sign-in route runs, minus the session write — so
	// the seed self-proves the ARG-8 fix on every run without leaving a session row.
	const [credential] = await db
		.select({ password: account.password })
		.from(account)
		.where(and(eq(account.userId, userId), eq(account.providerId, CREDENTIAL_PROVIDER_ID)))
		.limit(1)
	if (!credential?.password) {
		throw new Error(`[seed] no credential account hash for ${DEV_USER.email} — sign-in would fail.`)
	}
	const ok = await ctx.password.verify({ hash: credential.password, password: DEV_USER.password })
	if (!ok) {
		throw new Error(
			`[seed] credential verification failed for ${DEV_USER.email} — sign-in would fail.`
		)
	}

	console.warn(
		`[seed] verified sign-in for ${DEV_USER.email} in org "${DEV_ORG.name}" (slug: ${DEV_ORG.slug}).`
	)
}

await main()
process.exit(0)
