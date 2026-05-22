/**
 * Application error carrying an HTTP status.
 *
 * Thrown by domain and route code; caught once at the request boundary —
 * Fastify reads `statusCode` to set the response status, so a thrown
 * `AppError` becomes a clean 4xx instead of a generic 500. Unhandled
 * non-`AppError`s stay 500s.
 */
export class AppError extends Error {
	readonly statusCode: number

	constructor(statusCode: number, message: string, options?: ErrorOptions) {
		super(message, options)
		this.name = "AppError"
		this.statusCode = statusCode
	}
}
