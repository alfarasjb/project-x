import type { ExperimentTask } from "@langfuse/client"
import {
	AiReviewGoldenInputSchema,
	type AiReviewGoldenExpected,
	type AiReviewGoldenInput
} from "@shared/schemas/eval"
import { analyzeNode, type AnalyzeOutput } from "@server/audit/analyze"

/**
 * The task each golden row gets run through. Thin wrapper around the
 * shared `analyzeNode` — production and evals call into the same
 * function so a prompt or schema change can't drift between them.
 *
 * Returns just the `content` (the parsed `AnalyzeOutput`) — the
 * generation usage / model / provider already live on the surrounding
 * Langfuse span via the adapter's observability hook.
 *
 * We re-parse `item.input` through the schema rather than trust the
 * Langfuse generic propagation: dataset items pulled over the wire
 * come back loosely typed, and a schema check here also surfaces a
 * clear error for any hand-typed row that drifted from the contract.
 */
export const aiReviewTask: ExperimentTask<AiReviewGoldenInput, AiReviewGoldenExpected> = async (
	item
) => {
	const input = AiReviewGoldenInputSchema.parse(item.input)
	const result = await analyzeNode({
		path: input.path,
		kind: "file",
		contents: input.contents
	})
	return result.content satisfies AnalyzeOutput
}
