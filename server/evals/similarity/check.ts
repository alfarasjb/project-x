/* eslint-disable no-console -- this file is a CLI; console.log IS the user-facing output. */
import "@server/observability/tracing"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { getDb } from "@server/db"
import { projects } from "@server/db/schema/projects"
import { findSimilarNodes, findSimilarToText } from "@server/domain/embeddings/similarity"
import type { Graph, GraphNode } from "@shared/schemas/graph"

const uuidSchema = z.uuid()

/**
 * Dev-only retrieval smoke-test.
 *
 *   pnpm similarity:check --project <slug> --text "save todos to localStorage"
 *   pnpm similarity:check --project <slug> --node src/lib/storage.ts
 *
 * Pass `--project <slug>` for any project you've created + analyzed via the
 * UI. Defaults to `--k 5`. Either `--text` OR `--node` is required (text →
 * `findSimilarToText`, node → `findSimilarNodes`). Prints the input + top-K
 * matches with cosine distance + the description text so you can eyeball
 * "did retrieval pick the obvious neighbours."
 *
 * Picks the first project matching the slug across all orgs (slugs are
 * per-org and may collide if you've created the same-named project in
 * multiple orgs — disambiguate by creating a uniquely-slugged project).
 */

interface Args {
	projectSlug: string
	text?: string
	nodeId?: string
	k: number
	kinds?: string[]
}

function parseArgs(): Args {
	const args = process.argv.slice(2)
	const out: Partial<Args> = {}
	for (let i = 0; i < args.length; i++) {
		const flag = args[i]
		const value = args[i + 1]
		if (flag === "--project" && value) {
			out.projectSlug = value
			i++
		} else if (flag === "--text" && value) {
			out.text = value
			i++
		} else if (flag === "--node" && value) {
			out.nodeId = value
			i++
		} else if (flag === "--k" && value) {
			out.k = Number(value)
			i++
		} else if (flag === "--kinds" && value) {
			out.kinds = value.split(",").map((s) => s.trim())
			i++
		}
	}
	if (!out.projectSlug || (!out.text && !out.nodeId)) {
		console.error(
			"Usage: --project <slug> (--text <query> | --node <nodeId>) [--k 5] [--kinds file,module]"
		)
		process.exit(1)
	}
	return {
		projectSlug: out.projectSlug,
		text: out.text,
		nodeId: out.nodeId,
		k: out.k ?? 5,
		kinds: out.kinds
	}
}

async function main(): Promise<void> {
	const args = parseArgs()
	const db = getDb()

	// Accept either a project UUID or a slug. Slug is per-org so the seed
	// produces N rows across N orgs — passing a slug now errors out and
	// lists candidates so you can pick the right project id.
	const isUuid = uuidSchema.safeParse(args.projectSlug).success
	const matches = isUuid
		? await db
				.select({
					id: projects.id,
					slug: projects.slug,
					organizationId: projects.organizationId,
					actualGraph: projects.actualGraph
				})
				.from(projects)
				.where(eq(projects.id, args.projectSlug))
		: await db
				.select({
					id: projects.id,
					slug: projects.slug,
					organizationId: projects.organizationId,
					actualGraph: projects.actualGraph
				})
				.from(projects)
				.where(eq(projects.slug, args.projectSlug))

	if (matches.length === 0) {
		console.error(`Project not found by ${isUuid ? "id" : "slug"} "${args.projectSlug}".`)
		process.exit(1)
	}
	if (matches.length > 1) {
		console.error(
			`Ambiguous: ${matches.length} projects match slug "${args.projectSlug}". ` +
				`Re-run with --project <id>:\n` +
				matches.map((m) => `  ${m.id}  (org ${m.organizationId})`).join("\n")
		)
		process.exit(1)
	}
	const project = matches[0]
	if (!project) {
		// Unreachable — guarded above. Satisfies no-non-null-assertion.
		throw new Error("project lookup unexpectedly empty")
	}

	const graph = project.actualGraph as Graph
	const nodesById = new Map<string, GraphNode>(graph.nodes.map((n) => [n.id, n]))

	const results = args.text
		? await findSimilarToText({
				projectId: project.id,
				text: args.text,
				k: args.k,
				kinds: args.kinds
			})
		: await findSimilarNodes({
				projectId: project.id,
				nodeId: args.nodeId ?? "",
				k: args.k,
				kinds: args.kinds
			})

	console.log(`\nProject: ${project.slug} (${project.id})`)
	if (args.text) {
		console.log(`Query (text): "${args.text}"`)
	} else {
		const source = args.nodeId ? nodesById.get(args.nodeId) : undefined
		console.log(`Query (node): ${args.nodeId}`)
		if (source?.description?.what) {
			console.log(`  → ${source.description.what}`)
		}
	}
	console.log(`Top ${results.length} matches:\n`)
	if (results.length === 0) {
		console.log("(no results — is the project embedded? run Analyze on it first)")
		return
	}
	for (const [i, result] of results.entries()) {
		const node = nodesById.get(result.nodeId)
		const summary = node?.description?.what ?? "(no description)"
		const distance = result.distance.toFixed(4)
		console.log(`  ${i + 1}. [${distance}] ${result.kind.padEnd(6)} ${result.nodeId}`)
		console.log(`     ${summary}`)
	}
	console.log()
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error)
		process.exit(1)
	})
