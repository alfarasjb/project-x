import { config } from "dotenv"
import { z } from "zod"

/**
 * Environment variables — loaded from `.env` (via dotenv) and validated once,
 * here, at import time. Import `env` instead of reading `process.env` directly:
 * every consumer then gets a typed, validated value, and a missing or malformed
 * var fails the server at boot with a clear message rather than as a late 500.
 *
 * In production the platform (Railway) injects these directly — dotenv finds no
 * `.env` file and is simply a no-op.
 */
config({ quiet: true })

const envSchema = z.object({
	PORT: z.coerce.number().int().positive().default(3100),
	DATABASE_URL: z.string().min(1)
})

const parsed = envSchema.safeParse(process.env)
if (!parsed.success) {
	console.error(
		`❌ Invalid environment variables:\n${z.prettifyError(parsed.error)}\n` +
			"Copy .env.example to .env and fill in the missing values."
	)
	throw new Error("Invalid environment variables")
}

/** Typed, validated environment. */
export const env = parsed.data
