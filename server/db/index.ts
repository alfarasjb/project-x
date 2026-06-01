import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { env } from "@server/env"
import { projects } from "@server/db/schema/projects"
import { featureFlows } from "@server/db/schema/feature-flows"
import { nodeEmbeddings } from "@server/db/schema/embeddings"
import {
	account,
	invitation,
	member,
	organization,
	session,
	user,
	verification
} from "@server/db/schema/auth"

// Drizzle's schema object — list every table here (no barrel re-export).
// Auth tables (user/session/account/verification + org/member/invitation) live
// in `public`; domain tables live in `projectx`. Both share one connection.
const schema = {
	projects,
	featureFlows,
	nodeEmbeddings,
	user,
	session,
	account,
	verification,
	organization,
	member,
	invitation
}

export type Db = ReturnType<typeof drizzle<typeof schema>>

let cached: Db | null = null

/**
 * Lazy Drizzle connection. `DATABASE_URL` is validated at boot in `@server/env`,
 * so by the time this runs it is guaranteed present; the connection itself is
 * still opened on first use, not at import.
 */
export function getDb(): Db {
	if (cached) return cached
	const client = postgres(env.DATABASE_URL, { prepare: false })
	cached = drizzle(client, { schema })
	return cached
}
