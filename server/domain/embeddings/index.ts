import { and, eq, inArray, sql } from "drizzle-orm"
import { observe, updateActiveObservation } from "@langfuse/tracing"
import type { Graph, GraphNode } from "@shared/schemas/graph"
import { getDb } from "@server/db"
import { nodeEmbeddings, type NewNodeEmbedding } from "@server/db/schema/embeddings"
import { env } from "@server/env"
import { getEmbeddingAdapter } from "@server/llm/fallback/factory"
import { EMBEDDING_CHAINS } from "@server/llm/fallback/chains"
import { VOYAGE_BATCH_LIMIT } from "@server/llm/adapters/voyage"
import { buildEmbeddingDocument } from "@server/domain/embeddings/document"

/** Only file + module nodes are embedded in v1 — symbols are data-only. */
const EMBEDDABLE_KINDS: ReadonlySet<string> = new Set(["file", "module"])

interface EmbedNodesResult {
	embedded: number
	skipped: number
	failed: number
}

/**
 * Embed every embeddable node in `graph` whose description has changed (or
 * which has never been embedded). Mirrors the Analyze skip-unchanged pattern:
 * the embedding's `content_hash` is computed from the document text we
 * actually send to the model, so a description rewrite re-embeds while an
 * unchanged file is a free DB lookup.
 *
 * No-op when `VOYAGE_API_KEY` isn't set — embedding is an opt-in pipeline,
 * exactly like Analyze's `ANTHROPIC_API_KEY` handling.
 */
export async function embedNodes(projectId: string, graph: Graph): Promise<EmbedNodesResult> {
	if (!env.VOYAGE_API_KEY) {
		console.warn(`[embed] ${projectId}: skipped — VOYAGE_API_KEY not set`)
		return { embedded: 0, skipped: 0, failed: 0 }
	}

	const candidates = graph.nodes.filter((node) => EMBEDDABLE_KINDS.has(node.kind))
	const docsByNode = new Map<string, { node: GraphNode; text: string; hash: string }>()
	for (const node of candidates) {
		const doc = buildEmbeddingDocument(node)
		if (!doc) continue // skip undescribed nodes (option A)
		docsByNode.set(node.id, { node, text: doc.text, hash: doc.hash })
	}

	if (docsByNode.size === 0) {
		return { embedded: 0, skipped: candidates.length, failed: 0 }
	}

	// Skip-unchanged: pull existing hashes for these node ids and drop any
	// whose hash matches the doc we'd send. One round-trip, no per-node query.
	const db = getDb()
	const existing = await db
		.select({ nodeId: nodeEmbeddings.nodeId, contentHash: nodeEmbeddings.contentHash })
		.from(nodeEmbeddings)
		.where(
			and(
				eq(nodeEmbeddings.projectId, projectId),
				inArray(nodeEmbeddings.nodeId, [...docsByNode.keys()])
			)
		)
	const existingHashByNode = new Map(existing.map((row) => [row.nodeId, row.contentHash]))

	const toEmbed: { node: GraphNode; text: string; hash: string }[] = []
	let skippedByHash = 0
	for (const entry of docsByNode.values()) {
		if (existingHashByNode.get(entry.node.id) === entry.hash) {
			skippedByHash += 1
			continue
		}
		toEmbed.push(entry)
	}

	if (toEmbed.length === 0) {
		return {
			embedded: 0,
			skipped: candidates.length, // everything was either undescribed or hash-matched
			failed: 0
		}
	}

	const traced = observe(
		async () => {
			updateActiveObservation({
				input: { projectId, candidates: candidates.length, toEmbed: toEmbed.length },
				metadata: { projectId, skippedByHash, undescribed: candidates.length - docsByNode.size }
			})
			const result = await runEmbed(projectId, toEmbed)
			updateActiveObservation({
				output: { embedded: result.embedded, failed: result.failed }
			})
			return result
		},
		{ name: `embed-project ${projectId}`, asType: "span" }
	)
	const runResult = await traced()

	return {
		embedded: runResult.embedded,
		skipped: candidates.length - toEmbed.length,
		failed: runResult.failed
	}
}

/**
 * Run the embed pipeline over `toEmbed`, batched at Voyage's per-request
 * input limit. Each batch is one Langfuse embedding span (created inside
 * the adapter via the observability hook + the outer `observe()` here),
 * one HTTP call, one upsert.
 */
async function runEmbed(
	projectId: string,
	toEmbed: readonly { node: GraphNode; text: string; hash: string }[]
): Promise<{ embedded: number; failed: number }> {
	const adapter = getEmbeddingAdapter("embed-node")
	const chainEntry = EMBEDDING_CHAINS["embed-node"][0]
	if (!chainEntry) {
		throw new Error('No embedding chain configured for "embed-node"')
	}
	const { model, dimensions } = chainEntry
	const db = getDb()

	let embedded = 0
	let failed = 0

	for (let i = 0; i < toEmbed.length; i += VOYAGE_BATCH_LIMIT) {
		const batch = toEmbed.slice(i, i + VOYAGE_BATCH_LIMIT)
		const batchSpan = observe(
			async () => {
				updateActiveObservation({
					input: batch.map((e) => e.text),
					metadata: { batchSize: batch.length, batchStart: i }
				})
				try {
					const { embeddings } = await adapter.embed({ text: batch.map((e) => e.text) })
					const rows: NewNodeEmbedding[] = batch.map((entry, idx) => {
						const vector = embeddings[idx]
						if (!vector) {
							throw new Error(`Voyage returned no vector for batch index ${idx}`)
						}
						return {
							projectId,
							nodeId: entry.node.id,
							kind: entry.node.kind,
							embedding: vector,
							contentHash: entry.hash,
							model,
							dimensions,
							embeddedAt: new Date().toISOString()
						}
					})
					// Upsert — re-embedding a changed node replaces the existing row.
					await db
						.insert(nodeEmbeddings)
						.values(rows)
						.onConflictDoUpdate({
							target: [nodeEmbeddings.projectId, nodeEmbeddings.nodeId],
							set: {
								kind: sql.raw(`excluded.kind`),
								embedding: sql.raw(`excluded.embedding`),
								contentHash: sql.raw(`excluded.content_hash`),
								model: sql.raw(`excluded.model`),
								dimensions: sql.raw(`excluded.dimensions`),
								embeddedAt: sql.raw(`excluded.embedded_at`)
							}
						})
					embedded += batch.length
				} catch (error) {
					failed += batch.length
					const message = error instanceof Error ? error.message : String(error)
					console.warn(`[embed] batch starting at ${i} failed: ${message}`)
					updateActiveObservation({ level: "ERROR", statusMessage: message })
				}
			},
			{ name: `embed-batch [${i}..${i + batch.length - 1}]`, asType: "embedding" }
		)
		await batchSpan()
	}

	return { embedded, failed }
}
