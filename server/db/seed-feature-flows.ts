import type { Graph } from "@shared/schemas/graph"
import { listAllProjects } from "@server/domain/project"
import { createFeatureFlowForProject, featureFlowExists } from "@server/domain/feature-flow"

/**
 * Dev seed — a persisted "Login flow" feature flow on every existing project,
 * so the Feature Flows persistence stack (ARG-26) can be exercised end-to-end
 * without the AI creation paths (ARG-10 / ARG-11) existing yet.
 *
 * Login is a *feature flow of a project*, not a project of its own — so this
 * attaches the flow to each existing project (across all orgs); it never
 * creates a project. A user with no project yet gets nothing until they add
 * one. Idempotent: a project that already has the flow is skipped.
 *
 * Run with: `pnpm db:seed:flows`. Safe to re-run.
 */

const LOGIN_FLOW_SLUG = "login-flow"

/**
 * The login flow as a self-contained graph (the "sketch" side of the diff).
 * Nodes carry their own positions — a feature flow is small + curated, so it
 * brings its own layout rather than running the canvas layout pass. Each
 * node's `path` anchors it back to a real file in this repo, so once the
 * drift derivation (ARG-11) lands, this flow becomes a live intent-vs-actual
 * overlay of Project X's own auth.
 */
const LOGIN_FLOW_GRAPH: Graph = {
	nodes: [
		{
			id: "login/signin-page",
			path: "src/routes/signin.tsx",
			kind: "module",
			label: "Sign-in page",
			parentId: null,
			layer: "ui",
			position: { x: 40, y: 220 },
			size: { width: 240, height: 64 },
			description: {
				what: "The email + password form the user submits to sign in.",
				source: "manual"
			}
		},
		{
			id: "login/auth-client",
			path: "src/lib/auth-client.ts",
			kind: "module",
			label: "authClient.signIn",
			parentId: null,
			layer: "shared",
			position: { x: 340, y: 220 },
			size: { width: 240, height: 64 },
			description: {
				what: "Better-auth browser client — posts credentials to the auth API.",
				source: "manual"
			}
		},
		{
			id: "login/auth-route",
			path: "server/routes/auth.ts",
			kind: "module",
			label: "POST /api/auth/sign-in",
			parentId: null,
			layer: "route",
			position: { x: 640, y: 220 },
			size: { width: 240, height: 64 }
		},
		{
			id: "login/auth-server",
			path: "server/auth.ts",
			kind: "module",
			label: "better-auth handler",
			parentId: null,
			layer: "service",
			position: { x: 940, y: 220 },
			size: { width: 240, height: 64 },
			description: {
				what: "Verifies the credential, mints a session, sets the active org.",
				source: "manual"
			}
		},
		{
			id: "login/session-store",
			path: "server/db/schema/auth.ts",
			kind: "module",
			label: "session + account",
			parentId: null,
			layer: "data",
			position: { x: 1240, y: 120 },
			size: { width: 240, height: 64 }
		},
		{
			id: "login/projects-redirect",
			path: "src/routes/$orgSlug.projects.index.tsx",
			kind: "module",
			label: "Redirect → projects",
			parentId: null,
			layer: "ui",
			position: { x: 1240, y: 320 },
			size: { width: 240, height: 64 }
		}
	],
	edges: [
		{
			id: "login/signin-page->auth-client",
			source: "login/signin-page",
			target: "login/auth-client",
			kind: "dependency",
			interface: "submit credentials"
		},
		{
			id: "login/auth-client->auth-route",
			source: "login/auth-client",
			target: "login/auth-route",
			kind: "api-call",
			interface: "POST /sign-in"
		},
		{
			id: "login/auth-route->auth-server",
			source: "login/auth-route",
			target: "login/auth-server",
			kind: "dependency",
			interface: "route → handler"
		},
		{
			id: "login/auth-server->session-store",
			source: "login/auth-server",
			target: "login/session-store",
			kind: "data-flow",
			interface: "create session + account"
		},
		{
			id: "login/auth-server->projects-redirect",
			source: "login/auth-server",
			target: "login/projects-redirect",
			kind: "data-flow",
			interface: "set cookie → redirect"
		}
	]
}

/** Attach the login flow to one project, idempotently. */
async function seedProject(project: { id: string; name: string }): Promise<void> {
	if (await featureFlowExists(project.id, LOGIN_FLOW_SLUG)) {
		console.warn(`[seed:flows] "${project.name}": "${LOGIN_FLOW_SLUG}" already exists — skipping.`)
		return
	}

	const flow = await createFeatureFlowForProject(project.id, {
		name: "Login flow",
		slug: LOGIN_FLOW_SLUG,
		description: "How a sign-in moves from the form through better-auth to a session + redirect.",
		graph: LOGIN_FLOW_GRAPH
	})
	console.warn(
		`[seed:flows] "${project.name}": created "${flow.name}" (${flow.slug}) — ` +
			`${flow.nodeCount} nodes · ${flow.edgeCount} edges.`
	)
}

async function main(): Promise<void> {
	const projects = await listAllProjects()

	if (projects.length === 0) {
		console.warn(
			"[seed:flows] No projects found — create a project first (a feature flow belongs to one)."
		)
		return
	}

	console.warn(`[seed:flows] seeding the login flow onto ${projects.length} project(s)…`)
	for (const project of projects) {
		await seedProject(project)
	}
}

await main()
process.exit(0)
