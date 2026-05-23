import type { FastifyInstance } from "fastify"
import { fromNodeHeaders } from "better-auth/node"
import { auth } from "@server/auth"

/**
 * Mount better-auth's web-standard handler under `/api/auth/*`.
 *
 * Better-auth ships no official Fastify plugin — the documented integration
 * is this manual bridge: build a `Request` from the Fastify request, hand it
 * to `auth.handler`, then copy the `Response` back onto the Fastify reply.
 *
 * Body is JSON-stringified because Fastify has already parsed it by the time
 * this handler runs. Skip the body for GETs.
 *
 * **Set-Cookie is special.** Better-auth often sends multiple Set-Cookie
 * headers in a single response (session token + the cookie-cached session
 * blob). The `Headers.forEach` + `reply.header()` pattern collapses these
 * into one, because `reply.header()` REPLACES the value on each call. We
 * pull Set-Cookies separately via `getSetCookie()` and set them as an array
 * so Fastify emits one Set-Cookie line per entry — without this, calls like
 * `organization.setActive` write the DB but the new session cookie never
 * reaches the browser, so the session reads back stale (activeOrganizationId
 * = null) forever.
 */
export async function authRoutes(app: FastifyInstance): Promise<void> {
	app.route({
		method: ["GET", "POST"],
		url: "/api/auth/*",
		async handler(request, reply) {
			const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`)
			const init: RequestInit = {
				method: request.method,
				headers: fromNodeHeaders(request.headers)
			}
			if (request.method !== "GET" && request.body !== undefined && request.body !== null) {
				init.body = JSON.stringify(request.body)
			}
			const response = await auth.handler(new Request(url.toString(), init))

			reply.status(response.status)
			const setCookies = response.headers.getSetCookie()
			response.headers.forEach((value, key) => {
				if (key.toLowerCase() === "set-cookie") return
				reply.header(key, value)
			})
			for (const cookie of setCookies) {
				// `reply.raw.appendHeader` accumulates instead of replacing, which
				// is what we need for multiple Set-Cookie headers in one response.
				reply.raw.appendHeader("Set-Cookie", cookie)
			}
			const body = response.body ? await response.text() : null
			return reply.send(body)
		}
	})
}
