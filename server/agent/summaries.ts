import { z } from "zod"
import { getNodeTool } from "@server/tools/get-node"
import { listNodesTool } from "@server/tools/list-nodes"
import { findSimilarToNodeTool } from "@server/tools/find-similar"
import { findSimilarToTextTool } from "@server/tools/find-similar-to-text"

/**
 * Human-readable one-liners for the chat's tool-call cards. The shared
 * `ToolDefinition` returns full JSON domain objects; the loop synthesizes the
 * short `argsSummary` / `resultSummary` strings the `ChatEvent` UI wants here,
 * so the shared tool primitive stays untouched (a third consumer would justify a
 * `summarize()` method on the tool itself — two don't yet).
 *
 * The model's raw tool input and a tool's output are both untyped at this seam
 * (`Anthropic.ToolUseBlock.input` is `unknown`; `execute` erases its result to
 * `unknown`), so we read fields defensively through a Zod record rather than a
 * cast — a malformed shape degrades to a generic label, never throws.
 */

/** Tool input/output is untyped at this seam; coerce it to a readable record without a cast. */
const ToolPayloadSchema = z.record(z.string(), z.unknown())

function asRecord(value: unknown): Record<string, unknown> {
	const parsed = ToolPayloadSchema.safeParse(value)
	return parsed.success ? parsed.data : {}
}

function readString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined
}

function readNumber(value: unknown): number | undefined {
	return typeof value === "number" ? value : undefined
}

/** Short label for a tool call's arguments, keyed by tool name. */
export function summarizeToolArgs(toolName: string, input: unknown): string {
	const args = asRecord(input)
	switch (toolName) {
		case getNodeTool.name:
			return `node: ${readString(args.node_id) ?? "?"}`
		case listNodesTool.name:
			return `kind: ${readString(args.kind) ?? "all"}`
		case findSimilarToNodeTool.name:
			return `similar to: ${readString(args.node_id) ?? "?"}`
		case findSimilarToTextTool.name:
			return `search: ${readString(args.query) ?? "?"}`
		default:
			return toolName
	}
}

/** Short label for a tool call's result, keyed by tool name. */
export function summarizeToolResult(toolName: string, result: unknown): string {
	const out = asRecord(result)
	switch (toolName) {
		case getNodeTool.name: {
			const label = readString(out.label)
			const kind = readString(out.kind)
			if (!label) return "node"
			return kind ? `${label} (${kind})` : label
		}
		case listNodesTool.name: {
			const count = readNumber(out.count)
			const total = readNumber(out.total)
			return count !== undefined && total !== undefined ? `${count} of ${total} nodes` : "nodes"
		}
		case findSimilarToNodeTool.name:
		case findSimilarToTextTool.name: {
			const count = readNumber(out.count)
			return count !== undefined ? `${count} matches` : "matches"
		}
		default:
			return "done"
	}
}
