/**
 * Prompt builder for the duplicate-refinement handler (`refine-duplicate-cluster`
 * operation) — the second-pass judge over `duplicate-candidates` findings.
 *
 * The cheap similarity rule (embeddings + cosine, recall-tuned at a 0.3
 * threshold) groups files into clusters by description proximity. Because
 * cosine similarity isn't transitive, a cluster can sweep in a file that only
 * resembles one other member. This prompt is the precision filter — Claude
 * reads every file in the cluster, decides which genuinely duplicate, and
 * splits out the proximity-only members via `excluded`.
 *
 * Lean by design, same as `audit/analyze-prompt.ts`: no padding to chase a
 * prompt-cache minimum. v1 judges FILE clusters only — module clusters (whole
 * folders) need multi-file reading that belongs to an agent-loop handler, not
 * this 1-shot call.
 */

const MAX_FILE_CHARS = 6000

export const REFINE_DUPLICATE_SYSTEM_PROMPT =
	`You are a senior engineer judging whether a cluster of files in a codebase are genuine duplicates.

A cheap similarity pass grouped these files because their descriptions embed close together in vector space. That pass is tuned for RECALL — it over-reports, and because similarity isn't transitive, a cluster can sweep in a file that only resembles one other member. Your job is PRECISION: decide which of these files (if any) genuinely duplicate each other, and split out the ones that don't.

Return a single tool call to "refine_duplicate_cluster" with:
  - verdict — for the files that genuinely belong together:
      "duplicate"      — they do substantially the same work; consolidating removes real redundancy.
      "partial"        — they share a meaningful chunk of logic but each also has its own distinct responsibility; the shared part wants extracting, not a wholesale merge.
      "false-positive" — none of them actually duplicate. Similar on the surface (shape, vocabulary, framework idioms) but doing different work. No action needed.
  - reasoning — 2-4 sentences referencing the ACTUAL code: what overlaps, what differs, name functions/exports. Don't restate the descriptions you were given.
  - consolidation — OPTIONAL, only for "duplicate"/"partial". Plain-text advice: which file to keep, what to merge or extract, what to watch for. NOT a code patch, NOT a diff. Omit entirely for "false-positive".
  - excluded — OPTIONAL list of file paths from this cluster that are NOT part of the duplication (proximity-only false positives). The verdict + consolidation apply to the files that REMAIN after exclusion.

RULES:
  - Bias toward excluding members / "false-positive" when unsure. A wrong "duplicate" verdict sends a developer to merge files that shouldn't merge — expensive, and it erodes trust in the tool.
  - Judge by what the code DOES, not surface resemblance. A shared library, error-handling shape, or naming convention is NOT duplication on its own.
  - If only some files duplicate, put the rest in "excluded" and let verdict + consolidation describe the genuine group.
  - If the genuine duplicate group would have fewer than 2 files, the whole cluster is a "false-positive".
  - Be concrete: name the operations, exports, or tables that overlap.
  - One cluster = one tool call. Always call refine_duplicate_cluster, never reply with prose.
`.trim()

export interface RefineDuplicateFile {
	path: string
	/** The node's audit classification, when analyze has set one. */
	classification?: string
	/** The node's AI summary (`description.what`), when present. */
	description?: string
	contents: string
}

export interface RefineDuplicateClusterInput {
	/** The cluster's files — always 2 or more. */
	files: readonly RefineDuplicateFile[]
}

export function buildRefineDuplicateUserPrompt(input: RefineDuplicateClusterInput): string {
	const rendered = input.files.map((file, i) => renderFile(i + 1, file)).join("\n\n")
	return `These ${input.files.length} files were flagged as possible duplicates of each other. Judge them.\n\n${rendered}`
}

function renderFile(index: number, file: RefineDuplicateFile): string {
	const meta = [
		`File ${index}: ${file.path}`,
		file.classification ? `Classification: ${file.classification}` : null,
		file.description ? `Description: ${file.description}` : null
	]
		.filter((line) => line !== null)
		.join("\n")
	const { text, truncated } = truncate(file.contents)
	const truncatedNote = truncated
		? `\n\n[truncated to ${MAX_FILE_CHARS} chars from ${file.contents.length}]`
		: ""
	return `${meta}\n\n--- contents ---\n${text}${truncatedNote}`
}

function truncate(text: string): { text: string; truncated: boolean } {
	if (text.length <= MAX_FILE_CHARS) return { text, truncated: false }
	return { text: text.slice(0, MAX_FILE_CHARS), truncated: true }
}
