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
	DATABASE_URL: z.string().min(1),
	/**
	 * Better-auth API key — issued by the better-auth hosted dashboard, used
	 * both by the `dash()` infra plugin (its default-looked-up env name is
	 * `BETTER_AUTH_API_KEY`) AND as the session-signing secret on the
	 * `betterAuth({ secret })` config. One string, two roles — simpler than
	 * juggling a separate locally-generated signing secret, and the key is
	 * already a 32+ char random string so it satisfies the secret minimum.
	 */
	BETTER_AUTH_API_KEY: z.string().min(32),
	/**
	 * Public base URL of the Fastify server (where /api/auth/* lives). Used by
	 * better-auth to validate the `Origin` header on mutating requests and to
	 * build absolute URLs in emails. Dev: http://localhost:3100.
	 */
	BETTER_AUTH_URL: z.url(),
	/**
	 * Comma-separated list of origins allowed to call /api/auth/* and the API.
	 * Defaults to the Vite dev origin. In production, set this to your web
	 * origin (e.g. https://app.example.com).
	 */
	APP_URL: z.url().default("http://localhost:5173"),
	/**
	 * MCP server only — which project to bind to, given as a project id or slug.
	 * Optional: the MCP server falls back to matching the cwd, then to the sole
	 * project. Unused by the Fastify server.
	 */
	PROJECT_X_PROJECT: z.string().min(1).optional(),
	/**
	 * Anthropic API key — required only for the user-triggered Analyze action,
	 * which classifies + describes every file/module via Claude. Optional at
	 * boot so contributors without a key can still run the rest of the app
	 * (parse, crawl, heuristic audit). The /analyze route returns a clear 4xx
	 * when this is unset; nothing else cares.
	 */
	ANTHROPIC_API_KEY: z.string().min(1).optional(),
	/**
	 * Voyage AI API key — required only for the embedding pipeline (used by
	 * crawl/analyze to vectorize node descriptions for similarity search and
	 * future RAG). Optional at boot so contributors without a key can still
	 * run parse + analyze; embedding is skipped silently when unset.
	 */
	VOYAGE_API_KEY: z.string().min(1).optional(),
	/**
	 * Langfuse observability — optional. When BOTH keys are present, the OTel
	 * bootstrap (`server/observability/tracing.ts`) registers a span processor
	 * that ships every `observe()`-wrapped LLM call to Langfuse Cloud. Missing
	 * either key = telemetry silently no-ops; the app works identically.
	 */
	LANGFUSE_PUBLIC_KEY: z.string().min(1).optional(),
	LANGFUSE_SECRET_KEY: z.string().min(1).optional(),
	/** Self-hosted Langfuse URL; defaults to cloud. */
	LANGFUSE_BASE_URL: z.url().default("https://cloud.langfuse.com"),
	/** Tag traces with this string in Langfuse (e.g. "development", "production"). */
	LANGFUSE_ENVIRONMENT: z.string().min(1).default("development"),
	/**
	 * GitHub OAuth app credentials — optional. Required only for the GitHub
	 * integration (Settings → Integrations → Connect GitHub) and the
	 * import-from-GitHub project flow. When unset, better-auth's GitHub social
	 * provider is not registered and the integration UI tells the user the
	 * server-side credentials are missing.
	 *
	 * Create an OAuth app at https://github.com/settings/developers with the
	 * callback URL `${BETTER_AUTH_URL}/api/auth/callback/github`.
	 */
	GITHUB_CLIENT_ID: z.string().min(1).optional(),
	GITHUB_CLIENT_SECRET: z.string().min(1).optional()
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
