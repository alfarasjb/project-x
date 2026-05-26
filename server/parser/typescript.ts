import { createHash } from "node:crypto"
import { existsSync } from "node:fs"
import { readdir } from "node:fs/promises"
import { posix, sep as platformSep } from "node:path"
import {
	Node,
	Project,
	ts,
	type ArrowFunction,
	type FunctionDeclaration,
	type FunctionExpression,
	type SourceFile
} from "ts-morph"
import type { Graph, GraphEdge, GraphNode, NodeLayer, Signature } from "@shared/schemas/graph"

type FunctionLike = FunctionDeclaration | ArrowFunction | FunctionExpression

/** Flatten to a single line and cap length — type annotations can be verbose. */
function cap(text: string): string {
	const flat = text.replace(/\s+/g, " ").trim()
	return flat.length > 60 ? `${flat.slice(0, 57)}…` : flat
}

/**
 * Build a signature from *written* type annotations only — no type-checker
 * resolution. Fast, and it shows what the developer actually wrote.
 */
function signatureOf(fn: FunctionLike): Signature {
	const parameters = fn.getParameters().map((param) => {
		const typeNode = param.getTypeNode()
		return {
			name: param.getName(),
			...(typeNode ? { type: { name: cap(typeNode.getText()) } } : {}),
			...(param.hasQuestionToken() ? { optional: true } : {})
		}
	})
	const returnTypeNode = fn.getReturnTypeNode()
	return {
		parameters,
		...(returnTypeNode ? { returnType: { name: cap(returnTypeNode.getText()) } } : {})
	}
}

/** Exported primitives declared in a file → graph nodes parented to the file. */
function primitivesOf(sf: SourceFile, filePath: string): GraphNode[] {
	const out: GraphNode[] = []
	const push = (name: string, kind: string, signature?: Signature): void => {
		out.push({
			id: `${filePath}#${name}`,
			path: `${filePath}#${name}`,
			kind,
			label: name,
			parentId: filePath,
			...(signature ? { signature } : {})
		})
	}

	for (const fn of sf.getFunctions()) {
		const name = fn.getName()
		if (fn.isExported() && name) push(name, "function", signatureOf(fn))
	}
	for (const cls of sf.getClasses()) {
		const name = cls.getName()
		if (cls.isExported() && name) push(name, "class")
	}
	for (const iface of sf.getInterfaces()) {
		if (iface.isExported()) push(iface.getName(), "interface")
	}
	for (const alias of sf.getTypeAliases()) {
		if (alias.isExported()) push(alias.getName(), "type")
	}
	for (const en of sf.getEnums()) {
		if (en.isExported()) push(en.getName(), "enum")
	}
	for (const stmt of sf.getVariableStatements()) {
		if (!stmt.isExported()) continue
		for (const decl of stmt.getDeclarations()) {
			const init = decl.getInitializer()
			if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
				push(decl.getName(), "function", signatureOf(init))
			} else {
				push(decl.getName(), "constant")
			}
		}
	}
	return out
}

/**
 * Infer an architectural layer from a directory path — best-effort, name-based.
 * Only confident matches return a layer; a nested module without its own signal
 * inherits a parent's layer at render time (`effectiveLayer` in the canvas), so
 * this only needs to tag the directories that carry a clear architectural role.
 *
 * Interim: a semantic pass (an LLM reading each module) would classify this
 * better — folder names are a weak proxy for architectural role.
 */
function layerOf(dir: string): NodeLayer | undefined {
	const segments = dir.split("/")
	const last = segments[segments.length - 1] ?? ""

	if (segments.includes("node_modules")) return "external"
	if (last === "routes") return "route"
	if (last === "components" || last === "ui") return "ui"
	if (last === "db" || last === "data") return "data"
	if (last === "domain" || last === "mcp" || last === "parser" || last === "services") {
		return "service"
	}
	if (last === "lib" || last === "utils" || last === "shared" || last === "schemas") {
		return "shared"
	}
	// Top-level roots — a broad fallback for everything nested beneath them.
	if (dir === "server") return "service"
	if (dir === "src") return "ui"
	if (dir === "shared") return "shared"
	return undefined
}

/** Directories never worth parsing — dependencies, build output, VCS metadata. */
const IGNORED_DIRS = new Set(["node_modules", "dist", "build", "out", ".next", "coverage", ".git"])

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"]

/**
 * Whether a directory entry name should be skipped during the recursive
 * source walk. Matches the parser's "what counts as code" contract:
 * `IGNORED_DIRS` (vendored / generated / VCS) and dot-files we don't want
 * recursing into (`.git` is in IGNORED_DIRS but other dots like `.vscode`
 * pass through unless flagged later).
 */
function isIgnoredDir(name: string): boolean {
	return IGNORED_DIRS.has(name)
}

/**
 * Decide whether a file should land in the source set. Mirrors the old glob:
 * include `.ts/.tsx/.js/.jsx`, exclude `.d.ts` (declarations, no exports we
 * track) and `*.gen.*` (generated, churn-only).
 */
function isSourceFile(name: string): boolean {
	if (name.endsWith(".d.ts")) return false
	if (/\.gen\./.test(name)) return false
	return SOURCE_EXTENSIONS.some((ext) => name.endsWith(ext))
}

/**
 * Recursively enumerate source files under `root`. Returns absolute paths
 * (platform-native separators) so they pass straight to ts-morph's
 * `addSourceFileAtPath`.
 *
 * We do this manually instead of relying on `addSourceFilesAtPaths`'
 * glob support, which is fast-glob under the hood and falls over on
 * Windows tmp paths shaped like `D:\TEMP\…` — the local-rootPath crawl
 * works because the user's working dir doesn't trip the quirk, but a
 * worker container with a different tmpdir layout returns zero files.
 * A direct walk is path-shape-agnostic.
 */
async function walkSourceFiles(root: string): Promise<string[]> {
	const out: string[] = []
	const entries = await readdir(root, { recursive: true, withFileTypes: true })
	for (const entry of entries) {
		if (!entry.isFile()) continue
		if (!isSourceFile(entry.name)) continue
		// `parentPath` (Node 20+) is the directory the entry was found in,
		// already including any recursion. Falls back to `path` on older Node.
		const parent = entry.parentPath ?? (entry as unknown as { path: string }).path
		// Bail out of ignored directories — the recursive walk descends into
		// everything, so we filter by inspecting the parent path segments
		// rather than the entry's own name (the entry IS a source file at
		// this point).
		const relative = parent.slice(root.length).split(platformSep)
		if (relative.some((segment) => isIgnoredDir(segment))) continue
		out.push(`${parent}${platformSep}${entry.name}`)
	}
	return out
}

/**
 * Locate the repo's own TypeScript config so ts-morph picks up its path
 * aliases, `baseUrl`, and module resolution — without them, aliased imports
 * (`@/…`) don't resolve and dependency edges are lost. Falls back to
 * `jsconfig.json`, then to no config at all: a config-less or JS-only repo
 * still parses, just with default compiler options.
 */
function resolveTsConfig(root: string): string | undefined {
	for (const name of ["tsconfig.json", "jsconfig.json"]) {
		const candidate = `${root}/${name}`
		if (existsSync(candidate)) return candidate
	}
	return undefined
}

/**
 * Parse a TypeScript/JavaScript project into a Graph — topology only, no
 * positions (a layout pass assigns those). Modules are directories, files are
 * source files, primitives are exported declarations.
 *
 * Repo-layout-agnostic: it resolves the target repo's own tsconfig and globs
 * the whole tree, so any TS/JS project crawls — not just this one.
 */
export async function parseTypeScript(rootPath: string): Promise<Graph> {
	const root = rootPath.replace(/\\/g, "/").replace(/\/+$/, "")

	const tsConfigFilePath = resolveTsConfig(root)
	const project = new Project({
		...(tsConfigFilePath ? { tsConfigFilePath } : {}),
		// We read written annotations + in-repo imports only — never type-check.
		// Without these three, ts-morph recursively resolves every dependency and
		// parses the whole `node_modules` .d.ts tree, which makes a crawl crawl.
		skipAddingFilesFromTsConfig: true,
		skipFileDependencyResolution: true,
		skipLoadingLibFiles: true,
		// ReactJSX + allowJs just guarantee .tsx and .js files load.
		compilerOptions: { jsx: ts.JsxEmit.ReactJSX, allowJs: true }
	})
	const sourcePaths = await walkSourceFiles(root)
	for (const path of sourcePaths) {
		project.addSourceFileAtPath(path)
	}

	const sourceFiles = project.getSourceFiles()
	const relOf = (sf: SourceFile): string =>
		posix.relative(root, sf.getFilePath().replace(/\\/g, "/"))

	const moduleIds = new Set<string>()
	const fileNodes: GraphNode[] = []
	const primitiveNodes: GraphNode[] = []

	for (const sf of sourceFiles) {
		const filePath = relOf(sf)
		const dir = posix.dirname(filePath)
		const primitives = primitivesOf(sf, filePath)
		const text = sf.getFullText()
		const contentHash = createHash("sha256").update(text).digest("hex").slice(0, 16)
		fileNodes.push({
			id: filePath,
			path: filePath,
			kind: "file",
			label: posix.basename(filePath),
			parentId: dir === "." ? null : dir,
			metrics: {
				lineCount: sf.getEndLineNumber(),
				exportCount: primitives.length,
				contentHash
			}
		})
		primitiveNodes.push(...primitives)

		// Register the directory and every ancestor as a module.
		let d = dir
		while (d !== "." && d !== "") {
			moduleIds.add(d)
			d = posix.dirname(d)
		}
	}

	// Index direct children (files + sub-modules) per module so we can hash a
	// module's structure. The hash lets the analyze pass skip modules whose
	// children haven't changed — without it, every module re-analyzes on
	// every run, which is what was burning ~25% of every analyze.
	const moduleChildren = new Map<string, string[]>()
	for (const file of fileNodes) {
		if (!file.parentId) continue
		const bucket = moduleChildren.get(file.parentId) ?? []
		bucket.push(file.path)
		moduleChildren.set(file.parentId, bucket)
	}
	for (const dir of moduleIds) {
		const parent = posix.dirname(dir)
		if (parent === "." || parent === "") continue
		const bucket = moduleChildren.get(parent) ?? []
		bucket.push(dir)
		moduleChildren.set(parent, bucket)
	}

	const moduleNodes: GraphNode[] = [...moduleIds].map((dir) => {
		const parent = posix.dirname(dir)
		const layer = layerOf(dir)
		const children = (moduleChildren.get(dir) ?? []).slice().sort()
		const contentHash = createHash("sha256").update(children.join("\n")).digest("hex").slice(0, 16)
		return {
			id: dir,
			path: dir,
			kind: "module",
			label: posix.basename(dir),
			parentId: parent === "." ? null : parent,
			metrics: { contentHash },
			...(layer ? { layer } : {})
		}
	})

	// Dependency edges from import statements (file → file).
	const fileEdgeKeys = new Set<string>()
	const fileEdges: GraphEdge[] = []
	for (const sf of sourceFiles) {
		const from = relOf(sf)
		for (const imp of sf.getImportDeclarations()) {
			const target = imp.getModuleSpecifierSourceFile()
			if (!target) continue // external package or unresolved
			const to = relOf(target)
			if (to === from) continue
			const key = `${from}->${to}`
			if (fileEdgeKeys.has(key)) continue
			fileEdgeKeys.add(key)
			fileEdges.push({ id: `dep:${key}`, source: from, target: to, kind: "dependency" })
		}
	}

	// Roll file edges up to module-level edges.
	const moduleEdgeKeys = new Set<string>()
	const moduleEdges: GraphEdge[] = []
	for (const edge of fileEdges) {
		const from = posix.dirname(edge.source)
		const to = posix.dirname(edge.target)
		if (from === to || from === "." || to === ".") continue
		const key = `${from}->${to}`
		if (moduleEdgeKeys.has(key)) continue
		moduleEdgeKeys.add(key)
		moduleEdges.push({ id: `dep:mod:${key}`, source: from, target: to, kind: "dependency" })
	}

	return {
		nodes: [...moduleNodes, ...fileNodes, ...primitiveNodes],
		edges: [...moduleEdges, ...fileEdges]
	}
}
