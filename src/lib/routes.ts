/**
 * Centralized router paths.
 *
 * TanStack Router types `Link to=`, `navigate({ to })`, `redirect({ to })`,
 * and `getRouteApi(...)` against the file-route IDs auto-generated from
 * `src/routes/`. We centralize the strings here so a route rename touches
 * one file instead of every navigation site.
 *
 * `as const` preserves the literal type, so each value still satisfies
 * TanStack's `to` union — `to={routes.projectGraph}` and
 * `to="/$orgSlug/projects/$projectSlug/graph"` are equivalent to the
 * compiler.
 *
 * **Do NOT use these in `createFileRoute(...)`.** The TanStack Router Vite
 * plugin auto-corrects that string to match the actual filename, so the
 * literal must stay inline — the filename is the source of truth for what
 * a route IS, while `routes.*` is the registry of where call sites point.
 */
export const routes = {
	home: "/",
	signin: "/signin",
	signup: "/signup",
	onboarding: "/onboarding",
	org: "/$orgSlug",
	projects: "/$orgSlug/projects",
	project: "/$orgSlug/projects/$projectSlug",
	projectGraph: "/$orgSlug/projects/$projectSlug/graph",
	projectSettings: "/$orgSlug/projects/$projectSlug/settings",
	settings: "/$orgSlug/settings",
	settingsAccount: "/$orgSlug/settings/account",
	settingsIntegrations: "/$orgSlug/settings/integrations"
} as const
