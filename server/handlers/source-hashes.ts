/**
 * Skip-unchanged helpers shared by the issue-refinement handlers. Each handler
 * records the `metrics.contentHash` of every node it judged (`sourceHashes` on
 * the refinement); on the next analyze it re-runs only when those hashes have
 * changed. The multi-member collector (`hashesByPath`) and the comparison
 * (`hashesUnchanged`) both live here; the god-file handler keeps its own
 * single-node collector since it hashes exactly one file.
 */

import type { GraphNode } from "@shared/schemas/graph"

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

/**
 * Collect each node's `metrics.contentHash` keyed by path — nodes missing a hash
 * are skipped. The unit the duplicate/circular/boundary handlers record as
 * `sourceHashes` and feed to `hashesUnchanged` on the next run.
 */
export function hashesByPath(members: readonly GraphNode[]): Record<string, string> {
	const hashes: Record<string, string> = {}
	for (const node of members) {
		const hash = node.metrics?.contentHash
		if (hash) hashes[node.path] = hash
	}
	return hashes
}
