import type { ZodType } from "zod"

/**
 * Thin typed fetch wrappers for the Fastify API.
 *
 * Every server response crosses a Zod boundary: the body is parsed with
 * `schema`, so callers receive a fully-typed, validated value rather than a raw
 * `unknown`. Non-2xx responses throw — TanStack Query turns the rejection into
 * query/mutation error state.
 *
 * Paths are relative ("/api/projects"); Vite proxies `/api` to the server in
 * dev, and the build is served same-origin in production.
 */

/**
 * Build an Error for a non-2xx response, preferring the server's `message`
 * (Fastify error bodies carry one) over the bare HTTP status line — so a 400
 * "No such directory: …" reaches the UI intact.
 */
async function responseError(method: string, path: string, res: Response): Promise<Error> {
	let detail = `${res.status} ${res.statusText}`
	try {
		const body: unknown = await res.json()
		if (
			body !== null &&
			typeof body === "object" &&
			"message" in body &&
			typeof body.message === "string"
		) {
			detail = body.message
		}
	} catch {
		// Non-JSON body — fall back to the status line.
	}
	return new Error(`${method} ${path} failed: ${detail}`)
}

export async function apiGet<T>(path: string, schema: ZodType<T>): Promise<T> {
	const res = await fetch(path)
	if (!res.ok) {
		throw await responseError("GET", path, res)
	}
	return schema.parse(await res.json())
}

/**
 * POST counterpart of `apiGet`. `body` is JSON-encoded when provided; the
 * response is parsed through `schema`.
 */
export async function apiPost<T>(path: string, schema: ZodType<T>, body?: unknown): Promise<T> {
	const res = await fetch(path, {
		method: "POST",
		headers: body === undefined ? undefined : { "Content-Type": "application/json" },
		body: body === undefined ? undefined : JSON.stringify(body)
	})
	if (!res.ok) {
		throw await responseError("POST", path, res)
	}
	return schema.parse(await res.json())
}
