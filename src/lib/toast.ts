import { toast } from "sonner"
import { ApiError } from "@/lib/api"

/**
 * Toast helpers — thin wrappers over `sonner` so call sites don't need to
 * normalize errors before showing them.
 *
 * Use `toast.success(...)` directly from `sonner` for success messages (no
 * normalization needed). Use `toastError(error)` from here for failures: it
 * unwraps `ApiError` for the user-facing message, falls back gracefully on
 * unknown error shapes, and never silently swallows.
 */
export function toastError(error: unknown, fallback = "Something went wrong."): void {
	const message = errorMessage(error, fallback)
	toast.error(message)
}

/**
 * Extract a user-facing message from an unknown error.
 *
 * Priority:
 *   1. `ApiError` — the server's structured message, already user-facing.
 *   2. Native `Error` — use `.message` (assumes the throw site wrote a
 *      reasonable message). Generic strings like "Network request failed"
 *      pass through; they're better than nothing.
 *   3. Anything else — the fallback.
 *
 * Exported for non-toast contexts (inline error text on forms, etc.).
 */
export function errorMessage(error: unknown, fallback = "Something went wrong."): string {
	if (error instanceof ApiError) return error.message
	if (error instanceof Error) return error.message
	return fallback
}

export { toast }
