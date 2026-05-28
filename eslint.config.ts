import js from "@eslint/js"
import tseslint from "typescript-eslint"
import prettier from "eslint-config-prettier"

export default tseslint.config(
	{
		ignores: [
			"dist/**",
			"node_modules/**",
			"src/routeTree.gen.ts",
			"drizzle/**",
			".claude/**",
			// Trigger.dev CLI build cache — bundled .mjs chunks, gitignored. Never
			// our source; linting it spews thousands of no-undef errors.
			".trigger/**"
		]
	},
	js.configs.recommended,
	...tseslint.configs.strict,
	...tseslint.configs.stylistic,
	{
		rules: {
			"@typescript-eslint/no-unused-vars": [
				"warn",
				{ argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
			],
			"@typescript-eslint/consistent-type-imports": "warn",
			"@typescript-eslint/no-explicit-any": "error",
			"no-console": ["warn", { allow: ["warn", "error"] }]
		}
	},
	prettier
)
