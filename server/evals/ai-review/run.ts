/* eslint-disable no-console -- this file is a CLI; console.log IS the user-facing output. */
// Tracing first — same dance as the Fastify entrypoint so the experiment's
// LLM calls are captured by Langfuse just like a production crawl.
import "@server/observability/tracing"
import { readFile } from "node:fs/promises"
import { resolve } from "node:path"
import type { ExperimentItem } from "@langfuse/client"
import { z } from "zod"
import {
	AiReviewGoldenRowSchema,
	type AiReviewGoldenExpected,
	type AiReviewGoldenInput,
	type AiReviewGoldenRow
} from "@shared/schemas/eval"
import { getLangfuseClient } from "@server/evals/langfuse-client"
import {
	classificationAccuracyEvaluator,
	concernPrecisionRecallEvaluator,
	perCategoryConcernsRunEvaluator
} from "@server/evals/ai-review/evaluators"
import { aiReviewTask } from "@server/evals/ai-review/task"

/**
 * AI Review eval runner — runs the analyze pipeline against a golden set
 * and reports precision/recall per concern category.
 *
 * Two data sources, same task + evaluators:
 *   - `--source local --file <path>` (default `evals/fixtures/ai-review-stub.jsonl`)
 *     — for development before any real golden set exists. Scores still
 *     post to Langfuse so the run shows up in the UI; just not linked to
 *     a hosted dataset.
 *   - `--source langfuse --dataset <name>` — production path. Runs against
 *     a Langfuse Dataset, scores attach to the dataset run, regressions
 *     are comparable over time.
 *
 * Output: a formatted Langfuse result table to stdout. Per-row scores
 * (`concern_precision`, `concern_recall`, `concern_f1`, `classification_correct`)
 * and run-aggregated per-category scores (`precision_<category>`, etc.)
 * are all in the table + on the Langfuse run.
 */

interface CliArgs {
	source: "local" | "langfuse"
	file: string
	dataset: string
	name: string
	concurrency: number
}

function parseArgs(): CliArgs {
	const args = process.argv.slice(2)
	const out: Partial<CliArgs> = {}
	for (let i = 0; i < args.length; i++) {
		const flag = args[i]
		const value = args[i + 1]
		if (flag === "--source" && (value === "local" || value === "langfuse")) {
			out.source = value
			i++
		} else if (flag === "--file" && value) {
			out.file = value
			i++
		} else if (flag === "--dataset" && value) {
			out.dataset = value
			i++
		} else if (flag === "--name" && value) {
			out.name = value
			i++
		} else if (flag === "--concurrency" && value) {
			out.concurrency = Number(value)
			i++
		}
	}
	return {
		source: out.source ?? "local",
		file: out.file ?? "evals/fixtures/ai-review-stub.jsonl",
		dataset: out.dataset ?? "ai-review-golden",
		name: out.name ?? `ai-review ${new Date().toISOString()}`,
		concurrency: out.concurrency ?? 5
	}
}

async function loadLocalRows(file: string): Promise<AiReviewGoldenRow[]> {
	const abs = resolve(process.cwd(), file)
	const raw = await readFile(abs, "utf8")
	const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0)
	const rows: AiReviewGoldenRow[] = []
	for (const [index, line] of lines.entries()) {
		let parsed: unknown
		try {
			parsed = JSON.parse(line)
		} catch (cause) {
			throw new Error(
				`Line ${index + 1} of ${file} is not valid JSON: ${(cause as Error).message}`,
				{
					cause
				}
			)
		}
		const result = AiReviewGoldenRowSchema.safeParse(parsed)
		if (!result.success) {
			throw new Error(
				`Line ${index + 1} failed schema validation: ${z.prettifyError(result.error)}`
			)
		}
		rows.push(result.data)
	}
	return rows
}

function toExperimentItems(
	rows: AiReviewGoldenRow[]
): ExperimentItem<AiReviewGoldenInput, AiReviewGoldenExpected>[] {
	return rows.map((row) => ({
		input: row.input,
		expectedOutput: row.expectedOutput,
		metadata: row.metadata ?? {}
	}))
}

async function main(): Promise<void> {
	const args = parseArgs()
	const langfuse = getLangfuseClient()

	const evaluators = [concernPrecisionRecallEvaluator, classificationAccuracyEvaluator]
	const runEvaluators = [perCategoryConcernsRunEvaluator]

	if (args.source === "local") {
		const rows = await loadLocalRows(args.file)
		console.warn(`[eval] loaded ${rows.length} rows from ${args.file}`)
		const result = await langfuse.experiment.run({
			name: args.name,
			data: toExperimentItems(rows),
			task: aiReviewTask,
			evaluators,
			runEvaluators,
			maxConcurrency: args.concurrency
		})
		console.log(await result.format({ includeItemResults: true }))
		if (result.datasetRunUrl) console.log(`\nLangfuse run: ${result.datasetRunUrl}`)
	} else {
		const dataset = await langfuse.dataset.get(args.dataset)
		console.warn(
			`[eval] running against Langfuse dataset "${args.dataset}" (${dataset.items.length} items)`
		)
		const result = await dataset.runExperiment({
			name: args.name,
			task: aiReviewTask,
			evaluators,
			runEvaluators,
			maxConcurrency: args.concurrency
		})
		console.log(await result.format({ includeItemResults: true }))
		if (result.datasetRunUrl) console.log(`\nLangfuse run: ${result.datasetRunUrl}`)
	}
}

main().catch((error) => {
	console.error(error)
	process.exit(1)
})
