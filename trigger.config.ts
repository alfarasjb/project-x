import { defineConfig } from "@trigger.dev/sdk"

/**
 * Trigger.dev project config.
 *
 * Read by the Trigger CLI at build/deploy time — NOT by the running Fastify
 * server. (Runtime auth is via `TRIGGER_SECRET_KEY`, validated in
 * `@server/env`; `@trigger.dev/sdk` reads it from `process.env` directly
 * when you call `task.trigger()`.)
 *
 * `project` is the identity of the Trigger.dev cloud project this repo
 * deploys tasks to. After signing up at https://cloud.trigger.dev and
 * creating a project, replace the placeholder below with the project ref
 * shown in the dashboard (format: `proj_<hash>`). It's hardcoded — not env
 * — because Promptwise's pattern is for the ref to live in source: it
 * identifies the deploy target, and a stray env var swap shouldn't silently
 * redirect deploys.
 *
 * Tasks live in `./server/trigger`. The bundler picks up the `@server/*` /
 * `@shared/*` path aliases from the root `tsconfig.json` automatically (it
 * extends `tsconfig.base.json` where the aliases are defined).
 */
export default defineConfig({
	project: "proj_REPLACE_ME",
	dirs: ["./server/trigger"],
	runtime: "node",
	logLevel: "info",
	maxDuration: 300,
	retries: {
		enabledInDev: true,
		default: {
			maxAttempts: 3,
			minTimeoutInMs: 1000,
			maxTimeoutInMs: 10_000,
			factor: 2,
			randomize: true
		}
	}
})
