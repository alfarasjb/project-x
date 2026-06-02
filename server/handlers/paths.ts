import { posix } from "node:path"

/**
 * Resolve a graph node's repo-relative path against the analyzed source root.
 * Node paths are stored posix-style, so the source root's Windows separators are
 * normalized before joining — the result is a clean absolute posix path on any OS.
 *
 * Shared by the refinement handlers, which all read a node's source off disk from
 * the already-cloned repo at `sourcePath`.
 */
export function absolutePath(sourcePath: string, nodePath: string): string {
	return posix.join(sourcePath.replace(/\\/g, "/"), nodePath)
}
