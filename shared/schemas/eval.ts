import { z } from "zod"
import { ConcernCategorySchema, NodeClassificationSchema } from "@shared/schemas/graph"

/**
 * Eval schemas — the boundary between a hand-labeled golden set and the
 * runner that scores model output against it.
 *
 * Used by:
 *  - The CLI loader for local JSONL fixtures (`evals/fixtures/*.jsonl`)
 *  - Uploads to Langfuse Datasets (each row becomes a `DatasetItem`)
 *  - The runner's evaluators when computing precision/recall per concern
 */

/**
 * Input handed to the analyze pipeline for a single eval row — mirrors
 * the production `AnalyzeFileInput` shape but is restricted to files
 * (modules' analyze is graph-derived, so we can't eval them in isolation).
 */
export const AiReviewGoldenInputSchema = z.object({
	/** Path relative to the project root; recorded for trace metadata, not used for FS reads. */
	path: z.string().min(1),
	/** Full file contents the model will see — captured at labeling time so the eval is reproducible. */
	contents: z.string()
})
export type AiReviewGoldenInput = z.infer<typeof AiReviewGoldenInputSchema>

/**
 * Expected output for a single golden row.
 *
 * Concerns are SETS, not lists — the model emits at most 5 per file and
 * order doesn't matter. We grade precision/recall per category against
 * the union of expectedPresent + expectedAbsent (anything labeled is
 * load-bearing; categories the labeler skipped are excluded from
 * scoring so a partial label doesn't penalize the model unfairly).
 */
export const AiReviewGoldenExpectedSchema = z.object({
	/** Categories that SHOULD be flagged for this file. */
	expectedConcerns: z.array(ConcernCategorySchema).default([]),
	/** Categories that explicitly should NOT be flagged. Anything not listed in either array is "unknown" and won't be scored. */
	expectedAbsentConcerns: z.array(ConcernCategorySchema).default([]),
	/** Expected classification, if the labeler had a strong opinion. Omit to skip scoring it. */
	expectedClassification: NodeClassificationSchema.optional()
})
export type AiReviewGoldenExpected = z.infer<typeof AiReviewGoldenExpectedSchema>

/**
 * One row in a golden-set file. The JSONL shape — one row per line.
 */
export const AiReviewGoldenRowSchema = z.object({
	input: AiReviewGoldenInputSchema,
	expectedOutput: AiReviewGoldenExpectedSchema,
	/** Free-form notes from the labeler ("why this is hardcoded-domain-values"). Carried through to Langfuse for context. */
	metadata: z.record(z.string(), z.unknown()).optional()
})
export type AiReviewGoldenRow = z.infer<typeof AiReviewGoldenRowSchema>
