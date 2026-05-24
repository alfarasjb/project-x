import type { ZodType } from "zod"

/**
 * Thin typed fetch wrappers for the Fastify API.
 *
 * Every server response crosses a Zod boundary: the body is parsed with
 * `schema`, so callers receive a fully-typed, validated value rather than a raw
 * `unknown`. Non-2xx responses throw an `ApiError` — TanStack Query turns the
 * rejection into query/mutation error state.
 *
 * Paths are relative ("/api/projects"); Vite proxies `/api` to the server in
 * dev, and the build is served same-origin in production.
 */

/**
 * Typed error for non-2xx API responses. Carries the HTTP status + the
 * server's user-facing message (from the `{ error }` JSON the Fastify
 * `setErrorHandler` returns) — UIs surface `error.message` directly in toasts
 * without parsing.
 *
 * `status` lets callers branch on category (401 → "sign in again", 404 → "not
 * found page", 503 → "service unavailable") when they want richer handling
 * than just showing the message.
 */
export class ApiError extends Error {
	readonly status: number
	readonly details?: unknown

	constructor(status: number, message: string, details?: unknown) {
		super(message)
		this.name = "ApiError"
		this.status = status
		this.details = details
	}

	/** Convenience: is this a client error (4xx)? Server errors (5xx) are "our fault." */
	get isClientError(): boolean {
		return this.status >= 400 && this.status < 500
	}
}

/**
 * Build an `ApiError` from a non-2xx response. The server's centralized error
 * handler returns `{ error: string, details?: unknown }`; we lift those into
 * the typed error so the UI doesn't have to re-parse JSON on every catch.
 *
 * Falls back to the HTTP status line if the body isn't JSON (e.g. a proxy
 * error before the server saw the request).
 */
async function buildApiError(res: Response): Promise<ApiError> {
	let message = `${res.status} ${res.statusText}`
	let details: unknown
	try {
		const body: unknown = await res.json()
		if (body !== null && typeof body === "object") {
			if ("error" in body && typeof body.error === "string") {
				message = body.error
			}
			if ("details" in body) {
				details = (body as { details: unknown }).details
			}
		}
	} catch {
		// Non-JSON body — keep the status-line fallback.
	}
	return new ApiError(res.status, message, details)
}

export async function apiGet<T>(path: string, schema: ZodType<T>): Promise<T> {
	const res = await fetch(path)
	if (!res.ok) {
		throw await buildApiError(res)
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
		throw await buildApiError(res)
	}
	return schema.parse(await res.json())
}
