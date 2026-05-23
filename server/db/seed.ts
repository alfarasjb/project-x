import { eq } from "drizzle-orm"
import { auth } from "@server/auth"
import { getDb } from "@server/db"
import { user } from "@server/db/schema/auth"

/**
 * Dev seed — one deterministic account so a fresh DB wipe + migrate +
 * `pnpm db:seed` lands you in a usable signed-in state without going
 * through the signup form.
 *
 * KNOWN BROKEN (2026-05-23): calling `auth.api.signUpEmail` directly here
 * returns without throwing AND writes the `user` row, but does NOT persist
 * a `credential` `account` row — so sign-in for the seeded email fails
 * with "Invalid credentials" silently. Root cause is the public API
 * expecting an HTTP context (headers, request) that we don't supply when
 * calling it server-side from a one-shot script.
 *
 * To fix: drive the seed through the actual HTTP endpoint via `fetch`
 * (`POST http://localhost:3100/api/auth/sign-up/email`), so the whole
 * signup pipeline runs end-to-end (account row + cookie + databaseHooks).
 * Until then, sign up via the form.
 *
 * Idempotent: a second run notices the email already exists and exits
 * cleanly. Safe to run after every migration.
 *
 * Run with: `pnpm db:seed`
 *   → email:    dev@local.test
 *   → password: password1234
 */
const DEV_USER = {
	name: "Dev",
	email: "dev@local.test",
	password: "password1234"
} as const

async function main(): Promise<void> {
	const db = getDb()
	const [existing] = await db
		.select({ id: user.id })
		.from(user)
		.where(eq(user.email, DEV_USER.email))
		.limit(1)

	if (existing) {
		console.warn(`[seed] ${DEV_USER.email} already exists (id=${existing.id}) — skipping.`)
		return
	}

	await auth.api.signUpEmail({ body: DEV_USER })
	console.warn(
		`[seed] created ${DEV_USER.email} (password: ${DEV_USER.password}) — ` +
			`personal org auto-created by user.create hook.`
	)
}

await main()
process.exit(0)
