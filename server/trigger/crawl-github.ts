import { realpathSync } from "node:fs"
import { mkdtemp, readdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { logger, schemaTask } from "@trigger.dev/sdk"
import { extract as tarExtract } from "tar"
import { z } from "zod"
import { crawlProjectFromPath } from "@server/domain/graph"
import { getGithubAccessToken } from "@server/domain/github"
import { getProject } from "@server/domain/project"

/**
 * Crawl-from-GitHub task. Runs on a Trigger.dev worker container — the
 * Fastify dyno NEVER holds the clone or the AST. Memory + disk belong to a
 * per-task ephemeral machine and are reclaimed when the container exits.
 *
 * Flow:
 *   1. Resolve project + user's GitHub OAuth token from the DB. Token is
 *      not in the payload — fetched here so secrets don't sit in Trigger's
 *      stored run history.
 *   2. Download `https://api.github.com/repos/{owner}/{repo}/tarball` (no
 *      `ref` = default branch). Authenticated with the user's token so
 *      private repos work.
 *   3. Stream-extract the gzipped tar into a fresh `/tmp/<runId>`. `strip: 1`
 *      drops the leading `owner-repo-<sha>/` directory GitHub wraps the
 *      archive in.
 *   4. Hand the extracted path to the existing `crawlProjectFromPath`,
 *      which runs the parser, merges preserved fields, runs the heuristic
 *      audit, and persists graph + issues. Same code path the local crawl
 *      uses — diverges only on how the path got there.
 *   5. Best-effort cleanup of `/tmp` (container goes away regardless).
 */
export const crawlGithubRepoTask = schemaTask({
	id: "crawl-github-repo",
	schema: z.object({
		projectId: z.uuid(),
		userId: z.string().min(1)
	}),
	run: async ({ projectId, userId }) => {
		const project = await getProject(projectId)
		if (!project) throw new Error(`Project not found: ${projectId}`)
		if (!project.repoUrl) {
			throw new Error(`Project "${project.slug}" has no repoUrl — not a GitHub project.`)
		}
		const token = await getGithubAccessToken(userId)
		const { owner, repo } = parseGithubRepoUrl(project.repoUrl)

		const tmpDir = await mkdtemp(join(tmpdir(), "projectx-crawl-"))
		try {
			logger.info("downloading tarball", { owner, repo, tmpDir })
			await downloadAndExtractTarball({ owner, repo, token, dest: tmpDir })
			// DEBUG: log what landed in tmpDir so we can see if strip worked
			// + whether the parser will see the source files at the expected
			// depth. Drop these once GH crawl is stable.
			const topLevel = await readdir(tmpDir, { withFileTypes: true })
			logger.info("tmp dir contents after extract", {
				tmpDir,
				entries: topLevel.map((e) => `${e.name}${e.isDirectory() ? "/" : ""}`),
				count: topLevel.length
			})
			// Canonicalize the path via the OS — `tmpdir()` on Windows can return
			// a case that doesn't match the filesystem (e.g. `D:\TEMP\…` while
			// the real dir is `D:\Temp\…`), and ts-morph's globs are case-sensitive.
			// `realpathSync` returns the canonical form so the glob matches.
			const canonicalTmpDir = realpathSync(tmpDir)
			logger.info("running parse+audit", { projectId, tmpDir, canonicalTmpDir })
			const graph = await crawlProjectFromPath(project, canonicalTmpDir)
			logger.info("crawl complete", {
				projectId,
				nodes: graph.nodes.length,
				edges: graph.edges.length,
				files: graph.nodes.filter((n) => n.kind === "file").length,
				modules: graph.nodes.filter((n) => n.kind === "module").length
			})
			return {
				ok: true as const,
				nodes: graph.nodes.length,
				edges: graph.edges.length
			}
		} finally {
			await rm(tmpDir, { recursive: true, force: true }).catch((cause: unknown) => {
				logger.warn("failed to clean up tmp dir", { tmpDir, cause: String(cause) })
			})
		}
	}
})

/**
 * Parse `https://github.com/owner/repo` (with or without trailing `.git` /
 * trailing slash) into its `{ owner, repo }`. Anything else throws — the
 * task fails loudly because the project's `repoUrl` shouldn't have made it
 * past the import flow if it's malformed.
 */
function parseGithubRepoUrl(url: string): { owner: string; repo: string } {
	const trimmed = url.replace(/\.git$/, "").replace(/\/$/, "")
	const match = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)$/)
	if (!match || !match[1] || !match[2]) {
		throw new Error(`Not a github.com repository URL: ${url}`)
	}
	return { owner: match[1], repo: match[2] }
}

/**
 * Download the repo tarball (default branch when no `ref`) and stream-
 * extract it into `dest`. `tar` auto-detects gzip and we strip the leading
 * directory the archive comes wrapped in.
 *
 * Buffers nothing in memory beyond a single tar chunk at a time — fine for
 * monorepos that would otherwise OOM a small machine if we did
 * `arrayBuffer()`-and-write.
 */
async function downloadAndExtractTarball(args: {
	owner: string
	repo: string
	token: string
	dest: string
}): Promise<void> {
	const tarballUrl = `https://api.github.com/repos/${args.owner}/${args.repo}/tarball`
	const response = await fetch(tarballUrl, {
		headers: {
			Accept: "application/vnd.github+json",
			Authorization: `Bearer ${args.token}`,
			"X-GitHub-Api-Version": "2022-11-28",
			"User-Agent": "project-x"
		},
		redirect: "follow"
	})
	if (!response.ok) {
		throw new Error(`GitHub tarball download failed (${response.status} ${response.statusText})`)
	}
	if (!response.body) {
		throw new Error("GitHub tarball response had no body")
	}
	// Web ReadableStream → Node Readable so `pipeline` can drive it through `tar`.
	const nodeStream = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0])
	await pipeline(nodeStream, tarExtract({ cwd: args.dest, strip: 1 }))
}
