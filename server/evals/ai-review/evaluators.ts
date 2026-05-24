import type { Evaluation, Evaluator, RunEvaluator } from "@langfuse/client"
import type { ConcernCategory } from "@shared/schemas/graph"
import type { AiReviewGoldenExpected, AiReviewGoldenInput } from "@shared/schemas/eval"
import type { AnalyzeOutput } from "@server/audit/analyze"

type Input = AiReviewGoldenInput
type Expected = AiReviewGoldenExpected

/**
 * Per-row scoring of concern detection.
 *
 * Treats each row as a small classification problem over the set of
 * categories the labeler took a position on (expectedConcerns +
 * expectedAbsentConcerns). Categories the labeler skipped are out of
 * scope for that row — counting them as TN would inflate precision
 * meaninglessly, and counting them as anything else would be wrong.
 *
 * Returns three scores per row so Langfuse averages them across the run:
 *   - `concern_precision` — of categories the model flagged, what
 *     fraction were correct?
 *   - `concern_recall` — of categories that should have been flagged,
 *     what fraction did the model catch?
 *   - `concern_f1` — harmonic mean.
 */
export const concernPrecisionRecallEvaluator: Evaluator<Input, Expected> = async ({
	output,
	expectedOutput
}) => {
	if (!expectedOutput) return []
	const predicted = new Set(((output as AnalyzeOutput).concerns ?? []).map((c) => c.category))
	const expected = new Set(expectedOutput.expectedConcerns)
	const expectedAbsent = new Set(expectedOutput.expectedAbsentConcerns)
	const inScope = new Set<ConcernCategory>([...expected, ...expectedAbsent])

	let tp = 0
	let fp = 0
	let fn = 0
	for (const category of inScope) {
		const wasFlagged = predicted.has(category)
		const shouldBeFlagged = expected.has(category)
		if (wasFlagged && shouldBeFlagged) tp += 1
		else if (wasFlagged && !shouldBeFlagged) fp += 1
		else if (!wasFlagged && shouldBeFlagged) fn += 1
	}

	// Predictions outside the labeler's scope (model flagged something the
	// labeler didn't take a position on) are extra-curricular — we record
	// them in `metadata` for debugging but don't grade them.
	const outOfScopeFlagged = [...predicted].filter((c) => !inScope.has(c))

	const precision = tp + fp === 0 ? 1 : tp / (tp + fp)
	const recall = tp + fn === 0 ? 1 : tp / (tp + fn)
	const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)

	const meta = { tp, fp, fn, outOfScopeFlagged }
	return [
		{ name: "concern_precision", value: precision, metadata: meta },
		{ name: "concern_recall", value: recall, metadata: meta },
		{ name: "concern_f1", value: f1, metadata: meta }
	]
}

/**
 * Per-row classification accuracy — 1 if the model picked the same
 * classification the labeler did, 0 otherwise. Skipped (no evaluation
 * emitted) when the row didn't pin a classification, so partial labels
 * don't drag the average.
 */
export const classificationAccuracyEvaluator: Evaluator<Input, Expected> = async ({
	output,
	expectedOutput
}) => {
	if (!expectedOutput?.expectedClassification) return []
	const predicted = (output as AnalyzeOutput).classification
	const correct = predicted === expectedOutput.expectedClassification
	return {
		name: "classification_correct",
		value: correct ? 1 : 0,
		comment: correct
			? undefined
			: `predicted=${predicted}, expected=${expectedOutput.expectedClassification}`
	}
}

/**
 * Run-level aggregator: per-category precision/recall across ALL rows.
 *
 * The per-row evaluator averages over categories within a row; this one
 * averages over rows within a category — so "which concern types is the
 * model worst at?" is a single chart in Langfuse. Categories with no
 * in-scope rows are silently skipped.
 */
export const perCategoryConcernsRunEvaluator: RunEvaluator<Input, Expected> = async ({
	itemResults
}) => {
	const counters = new Map<ConcernCategory, { tp: number; fp: number; fn: number }>()
	for (const item of itemResults) {
		const expected = item.expectedOutput as Expected | undefined
		if (!expected) continue
		const output = item.output as AnalyzeOutput | undefined
		if (!output) continue
		const predicted = new Set(output.concerns.map((c) => c.category))
		const expectedSet = new Set(expected.expectedConcerns)
		const expectedAbsentSet = new Set(expected.expectedAbsentConcerns)
		const inScope = new Set<ConcernCategory>([...expectedSet, ...expectedAbsentSet])
		for (const category of inScope) {
			const counter = counters.get(category) ?? { tp: 0, fp: 0, fn: 0 }
			if (predicted.has(category) && expectedSet.has(category)) counter.tp += 1
			else if (predicted.has(category) && !expectedSet.has(category)) counter.fp += 1
			else if (!predicted.has(category) && expectedSet.has(category)) counter.fn += 1
			counters.set(category, counter)
		}
	}

	const evaluations: Evaluation[] = []
	for (const [category, { tp, fp, fn }] of counters) {
		const precision = tp + fp === 0 ? 1 : tp / (tp + fp)
		const recall = tp + fn === 0 ? 1 : tp / (tp + fn)
		const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
		evaluations.push(
			{ name: `precision_${category}`, value: precision, metadata: { tp, fp, fn } },
			{ name: `recall_${category}`, value: recall, metadata: { tp, fp, fn } },
			{ name: `f1_${category}`, value: f1, metadata: { tp, fp, fn } }
		)
	}
	return evaluations
}
