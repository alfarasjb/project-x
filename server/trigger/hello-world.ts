import { logger, schemaTask } from "@trigger.dev/sdk"
import { z } from "zod"
import { getAdapter } from "@server/llm/fallback/factory"

/**
 * First Trigger.dev task — exists to prove the build pipeline works end-to-end:
 * the SDK resolves, our `@server/*` path alias resolves through Trigger's
 * esbuild bundler, and the task runs in the Trigger cloud worker.
 *
 * `getAdapter` is referenced (not invoked) on purpose — invoking it would
 * require `ANTHROPIC_API_KEY` to be set in the Trigger environment, which
 * defeats the point of a smoke test. The reference alone is enough: if the
 * alias didn't resolve, the build would fail.
 */
export const helloWorldTask = schemaTask({
	id: "hello-world",
	schema: z.object({
		name: z.string().default("World")
	}),
	run: async ({ name }) => {
		const factoryAvailable = typeof getAdapter === "function"
		const timestamp = new Date().toISOString()
		logger.info(`hello-world ran at ${timestamp}`, { name, factoryAvailable })
		return {
			greeting: `Hello, ${name}!`,
			timestamp,
			factoryAvailable
		}
	}
})
