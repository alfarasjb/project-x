/**
 * Skip-unchanged helper shared by the issue-refinement handlers. Each handler
 * records the `metrics.contentHash` of every node it judged (`sourceHashes` on
 * the refinement); on the next analyze it re-runs only when those hashes have
 * changed. How the per-node hashes are collected differs per handler (a duplicate
 * cluster's members vs a single god file), but the comparison is identical — so
 * the comparison lives here and the collection stays with each handler.
 */
export function hashesUnchanged(
	prev: Record<string, string>,
	current: Record<string, string>
): boolean {
	const prevKeys = Object.keys(prev)
	const currentKeys = Object.keys(current)
	// No recorded hashes, or a different set of nodes → can't prove unchanged.
	if (prevKeys.length === 0 || prevKeys.length !== currentKeys.length) return false
	return currentKeys.every((key) => prev[key] === current[key])
}
