/**
 * Format an ISO timestamp as a short relative string ("2h ago", "3d ago").
 * Caps at 30d; older dates show the absolute date.
 */
export function formatDate(iso: string): string {
	const then = new Date(iso).getTime()
	const now = Date.now()
	const diffSec = Math.round((now - then) / 1000)
	if (diffSec < 60) return "just now"
	if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`
	if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`
	const diffDays = Math.round(diffSec / 86400)
	if (diffDays < 30) return `${diffDays}d ago`
	return new Date(iso).toLocaleDateString()
}
