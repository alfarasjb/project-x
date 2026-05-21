import { posix } from "node:path"
import {
	Node,
	Project,
	ts,
	type ArrowFunction,
	type FunctionDeclaration,
	type FunctionExpression,
	type SourceFile
} from "ts-morph"
import type { Graph, GraphEdge, GraphNode, Signature } from "@shared/schemas/graph.js"

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
 * Parse a TypeScript/JavaScript project into a Graph — topology only, no
 * positions (a layout pass assigns those). Modules are directories, files are
 * source files, primitives are exported declarations.
 */
export async function parseTypeScript(rootPath: string): Promise<Graph> {
	const root = rootPath.replace(/\\/g, "/").replace(/\/+$/, "")

	const project = new Project({
		tsConfigFilePath: `${root}/tsconfig.base.json`,
		skipAddingFilesFromTsConfig: true,
		compilerOptions: { jsx: ts.JsxEmit.ReactJSX }
	})
	project.addSourceFilesAtPaths([
		`${root}/src/**/*.{ts,tsx}`,
		`${root}/server/**/*.ts`,
		`${root}/shared/**/*.ts`,
		`!${root}/**/*.gen.ts`,
		`!${root}/**/*.d.ts`,
		`!${root}/**/node_modules/**`
	])

	const sourceFiles = project.getSourceFiles()
	const relOf = (sf: SourceFile): string =>
		posix.relative(root, sf.getFilePath().replace(/\\/g, "/"))

	const moduleIds = new Set<string>()
	const fileNodes: GraphNode[] = []
	const primitiveNodes: GraphNode[] = []

	for (const sf of sourceFiles) {
		const filePath = relOf(sf)
		const dir = posix.dirname(filePath)
		fileNodes.push({
			id: filePath,
			path: filePath,
			kind: "file",
			label: posix.basename(filePath),
			parentId: dir === "." ? null : dir
		})
		primitiveNodes.push(...primitivesOf(sf, filePath))

		// Register the directory and every ancestor as a module.
		let d = dir
		while (d !== "." && d !== "") {
			moduleIds.add(d)
			d = posix.dirname(d)
		}
	}

	const moduleNodes: GraphNode[] = [...moduleIds].map((dir) => {
		const parent = posix.dirname(dir)
		return {
			id: dir,
			path: dir,
			kind: "module",
			label: posix.basename(dir),
			parentId: parent === "." ? null : parent
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
