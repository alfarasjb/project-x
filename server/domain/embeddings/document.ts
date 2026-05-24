import { createHash } from "node:crypto"
import type { GraphNode } from "@shared/schemas/graph"

/**
 * Build the structured text the embedding model sees for one node.
 *
 * Standard RAG pattern: prepend lightweight structural metadata (path,
 * classification) to the semantic content (summary + rationale). The
 * vector then captures both "what does this code do" and "where does it
 * sit in the architecture," so similarity search returns peer-level
 * matches by both axes.
 *
 * Returns `null` when the node has no AI/manual description yet — we
 * deliberately skip undescribed nodes (option A from the design
 * discussion) rather than fall back to embedding just the path, because
 * a path-only vector is more misleading than missing data.
 */
export function buildEmbeddingDocument(node: GraphNode): { text: string; hash: string } | null {
	if (!node.description?.what) return null
	const lines: string[] = []
	lines.push(`Path: ${node.path}`)
	lines.push(`Kind: ${node.kind}`)
	if (node.classification) lines.push(`Classification: ${node.classification}`)
	lines.push(`Summary: ${node.description.what}`)
	if (node.description.why) lines.push(`Rationale: ${node.description.why}`)
	const text = lines.join("\n")
	return { text, hash: hashContent(text) }
}

/** sha256(text) → first 16 hex chars. Matches the parser's `metrics.contentHash` style. */
function hashContent(text: string): string {
	return createHash("sha256").update(text).digest("hex").slice(0, 16)
}
