import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { env } from "@server/env"
import { projects } from "@server/db/schema/projects"

// Drizzle's schema object — list every table here (no barrel re-export).
const schema = { projects }

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
