import { sql } from "drizzle-orm"
import { customType, pgSchema, type PgTimestampConfig } from "drizzle-orm/pg-core"

export const schema = pgSchema("projectx")

export const timestampConfig: PgTimestampConfig = { mode: "date", withTimezone: true }

export const timestamp = customType<{
	data: string
	driverData: string
	config: { withTimezone?: boolean; precision?: number }
}>({
	dataType(config) {
		const precision = typeof config?.precision !== "undefined" ? ` (${config.precision})` : ""
		return `timestamp${precision}${config?.withTimezone ? " with time zone" : ""}`
	},
	fromDriver(value: string): string {
		return new Date(value).toISOString()
	}
})

export const timestamps = {
	createdAt: timestamp("created_at", timestampConfig)
		.notNull()
		.default(sql`now()`),
	updatedAt: timestamp("updated_at", timestampConfig),
	archivedAt: timestamp("archived_at", timestampConfig),
	deletedAt: timestamp("deleted_at", timestampConfig)
}
