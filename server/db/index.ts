import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema/index.js"

export type Db = ReturnType<typeof drizzle<typeof schema>>

let cached: Db | null = null

export function getDb(): Db {
	if (cached) return cached
	const url = process.env.DATABASE_URL
	if (!url) {
		throw new Error(
			"DATABASE_URL is not set. Postgres is required — graph state (intent + actual) lives in JSONB columns on the projects table."
		)
	}
	const client = postgres(url, { prepare: false })
	cached = drizzle(client, { schema })
	return cached
}
