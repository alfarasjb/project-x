/**
 * ContextBuilder — assembles an LLM user prompt from labelled XML blocks under a
 * token budget. Shared primitive: the 1-shot duplicate-refinement prompt and the
 * god-file agent loop both build their context through it, so block formatting,
 * truncation, and budgeting can't drift between handlers.
 *
 * Pure: blocks in, assembled text out. No FS, no network, no clock — the same
 * input always renders the same string, which keeps it trivially unit-testable
 * and safe to call from anywhere (handlers, an eval runner, a future canvas).
 *
 * Prompt-cache breakpoints are DESIGNED FOR but not yet WIRED: a block may carry
 * a `kind` locality hint (`static`/`cached`/`recent`/`tail`) so the day we thread
 * Anthropic `cache_control` through the adapter we can split the message at the
 * static↔volatile boundary. Today the adapter flattens to text, so `build()`
 * returns a string and `kind` is unread metadata — hence optional, to keep
 * call sites that don't care about caching quiet.
 */

/** Rough chars-per-token ratio. Good enough for budgeting; we don't ship a tokenizer dep. */
const CHARS_PER_TOKEN = 4

/** Marker appended to a block's content when the budget forced a truncation. */
const TRUNCATION_MARKER = "\n[truncated]"

/**
 * Cache-locality hint for a block. Forward-looking — see the file header. Order
 * here is the intended prompt order (most stable first) for when caching lands.
 */
export type ContextBlockKind = "static" | "cached" | "recent" | "tail"

export interface ContextBlock {
	/** XML tag wrapping the block, e.g. "file", "node", "instructions". */
	tag: string
	/** Cache-locality hint (forward-looking; unread until `cache_control` is wired). */
	kind?: ContextBlockKind
	/** Inner text of the block. */
	content: string
	/** Optional XML attributes rendered on the open tag; undefined/"" entries are dropped. */
	attrs?: Record<string, string | number | undefined>
}

export interface ContextBuilderOptions {
	/** Soft cap on the assembled prompt. Blocks are truncated, in insertion order, to fit. */
	maxTokens?: number
	/** Per-block content character cap, applied before the global token budget. */
	maxBlockChars?: number
}

export interface ContextBuildResult {
	text: string
	/** Estimated token count of `text` (chars / CHARS_PER_TOKEN). */
	estimatedTokens: number
	/** True if any block was cut by `maxBlockChars` or the `maxTokens` budget. */
	truncated: boolean
}

/**
 * Convenience input for the most common block: a source file with optional
 * audit metadata. Mirrors what the duplicate-refinement and analyze prompts
 * rendered by hand before this primitive existed.
 */
export interface FileBlockInput {
	path: string
	contents: string
	classification?: string
	description?: string
	/** Defaults to "tail" — file contents are the most volatile, least-cacheable part. */
	kind?: ContextBlockKind
}

export class ContextBuilder {
	private readonly blocks: ContextBlock[] = []

	constructor(private readonly options: ContextBuilderOptions = {}) {}

	/** Append a raw block. Insertion order is priority order under the token budget. */
	add(block: ContextBlock): this {
		this.blocks.push(block)
		return this
	}

	/** Append a `<file>` block carrying the path + optional classification/description as attributes. */
	addFile(input: FileBlockInput): this {
		return this.add({
			tag: "file",
			kind: input.kind ?? "tail",
			content: input.contents,
			attrs: {
				path: input.path,
				...(input.classification ? { classification: input.classification } : {}),
				...(input.description ? { description: input.description } : {})
			}
		})
	}

	/** Render the assembled prompt, truncating blocks (in insertion order) to honour the budget. */
	build(): ContextBuildResult {
		const { maxTokens, maxBlockChars } = this.options
		let usedTokens = 0
		let truncated = false
		const rendered: string[] = []

		for (const block of this.blocks) {
			let content = block.content
			if (maxBlockChars !== undefined && content.length > maxBlockChars) {
				content = clip(content, maxBlockChars)
				truncated = true
			}
			if (maxTokens !== undefined) {
				const overhead = estimateTokens(renderBlock(block.tag, block.attrs, ""))
				const contentBudget = maxTokens - usedTokens - overhead
				if (estimateTokens(content) > contentBudget) {
					content = clip(content, Math.max(0, contentBudget) * CHARS_PER_TOKEN)
					truncated = true
				}
			}
			const text = renderBlock(block.tag, block.attrs, content)
			rendered.push(text)
			usedTokens += estimateTokens(text)
		}

		const text = rendered.join("\n\n")
		return { text, estimatedTokens: estimateTokens(text), truncated }
	}
}

function estimateTokens(text: string): number {
	return Math.ceil(text.length / CHARS_PER_TOKEN)
}

/** Truncate to `maxChars` and append the marker. An empty budget yields just the marker. */
function clip(text: string, maxChars: number): string {
	return text.slice(0, Math.max(0, maxChars)) + TRUNCATION_MARKER
}

function renderBlock(tag: string, attrs: ContextBlock["attrs"], content: string): string {
	return `<${tag}${renderAttrs(attrs)}>\n${content}\n</${tag}>`
}

function renderAttrs(attrs: ContextBlock["attrs"]): string {
	if (!attrs) return ""
	return Object.entries(attrs)
		.filter(([, value]) => value !== undefined && value !== "")
		.map(([key, value]) => ` ${key}="${escapeAttr(String(value))}"`)
		.join("")
}

function escapeAttr(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;")
}
