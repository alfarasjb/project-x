import type { ZodType } from "zod"

/**
 * Thin typed fetch wrapper for the Fastify API.
 *
 * Every server response crosses a Zod boundary: `apiGet` parses the body with
 * `schema`, so callers receive a fully-typed, validated value rather than a raw
 * `unknown`. Non-2xx responses throw — TanStack Query turns the rejection into
 * query error state.
 *
 * Paths are relative ("/api/graph"); Vite proxies `/api` to the server in dev,
 * and the build is served same-origin in production.
 */
export async function apiGet<T>(path: string, schema: ZodType<T>): Promise<T> {
	const res = await fetch(path)
	if (!res.ok) {
		throw new Error(`GET ${path} failed: ${res.status} ${res.statusText}`)
	}
	return schema.parse(await res.json())
}
