import { realpathSync } from "node:fs"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { extract as tarExtract } from "tar"
import type { Project } from "@shared/schemas/project"
import { getGithubAccessToken } from "@server/domain/github"
import { AppError } from "@server/utils/errors"

/**
 * Shallow-clone the project's GitHub repo into a fresh tmp dir, run `work`
 * against that dir, then unconditionally clean up. Higher-order callback
 * pattern so `try/finally` is owned here — callers can't forget to `rm`
 * the temp dir.
 *
 * The path passed to `work` is canonicalized via `realpathSync` so any
 * case-mismatched tmpdir (Windows `D:\TEMP\…` vs `D:\Temp\…`) doesn't trip
 * downstream file-walks. Without that, the parser silently saw zero files
 * on Windows workers.
 *
 * We accept the cost of re-cloning per task at our current scale — the
 * alternative ("clone once, cache in object storage or DB") is a future
 * R2/Postgres swap behind this same call site. When that day comes the
 * helper turns into "fetch from cache, fall back to clone" without
 * disturbing the task bodies.
 */
export async function withClonedRepo<T>(
	project: Project,
	userId: string,
	work: (sourcePath: string) => Promise<T>
): Promise<T> {
	if (!project.repoUrl) {
		throw new AppError(500, `withClonedRepo called for a non-GitHub project: ${project.slug}`)
	}
	const token = await getGithubAccessToken(userId)
	const { owner, repo } = parseGithubRepoUrl(project.repoUrl)

	const tmpDir = await mkdtemp(join(tmpdir(), "projectx-clone-"))
	try {
		await downloadAndExtractTarball({ owner, repo, token, dest: tmpDir })
		const canonical = realpathSync(tmpDir)
		return await work(canonical)
	} finally {
		await rm(tmpDir, { recursive: true, force: true }).catch(() => {
			// Best-effort. Container goes away anyway.
		})
	}
}

/**
 * Parse `https://github.com/owner/repo` (with or without trailing `.git` /
 * trailing slash) into `{ owner, repo }`. A malformed URL throws — the
 * project shouldn't have made it past the import flow.
 */
function parseGithubRepoUrl(url: string): { owner: string; repo: string } {
	const trimmed = url.replace(/\.git$/, "").replace(/\/$/, "")
	const match = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)$/)
	if (!match || !match[1] || !match[2]) {
		throw new AppError(400, `Not a github.com repository URL: ${url}`)
	}
	return { owner: match[1], repo: match[2] }
}

/**
 * Download the repo tarball (default branch when no `ref`) and stream-
 * extract it into `dest`. `tar` auto-detects gzip; `strip: 1` drops the
 * leading `owner-repo-<sha>/` directory GitHub wraps the archive in.
 *
 * Streams a single tar chunk at a time — bounded memory regardless of
 * repo size, which is what lets a small machine handle a fat monorepo.
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
		throw new AppError(
			502,
			`GitHub tarball download failed (${response.status} ${response.statusText})`
		)
	}
	if (!response.body) {
		throw new AppError(502, "GitHub tarball response had no body")
	}
	const nodeStream = Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0])
	await pipeline(nodeStream, tarExtract({ cwd: args.dest, strip: 1 }))
}
