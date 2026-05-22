import type { Graph } from "@shared/schemas/graph"
import { parseTypeScript } from "@server/parser/typescript"

/**
 * A language-specific parser. Each language gets its own implementation; they
 * all emit the same language-agnostic Graph. ts-morph is the first.
 */
export interface LanguageParser {
	readonly language: string
	readonly extensions: readonly string[]
	parse(rootPath: string): Promise<Graph>
}

export const typescriptParser: LanguageParser = {
	language: "typescript",
	extensions: [".ts", ".tsx", ".js", ".jsx"],
	parse: parseTypeScript
}

/**
 * Parse a project at `rootPath` into a Graph. TypeScript only for now —
 * additional LanguageParsers plug in here and their outputs merge into one
 * graph (node identity is path-based, so they never collide).
 */
export async function parseProject(rootPath: string): Promise<Graph> {
	return typescriptParser.parse(rootPath)
}
