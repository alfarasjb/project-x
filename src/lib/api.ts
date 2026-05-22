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

/**
 * POST counterpart of `apiGet`. `body` is JSON-encoded when provided; the
 * response is parsed through `schema` so callers get a validated value. Non-2xx
 * responses throw — TanStack Query turns the rejection into mutation error
 * state.
 */
export async function apiPost<T>(path: string, schema: ZodType<T>, body?: unknown): Promise<T> {
	const res = await fetch(path, {
		method: "POST",
		headers: body === undefined ? undefined : { "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body)
	})
	if (!res.ok) {
		throw new Error(`POST ${path} failed: ${res.status} ${res.statusText}`)
	}
	return schema.parse(await res.json())
}
