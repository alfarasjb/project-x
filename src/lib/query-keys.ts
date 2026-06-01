/**
 * Single source of truth for TanStack Query cache keys.
 *
 * Every `queryKey` used in `useQuery` / `queryOptions` AND every key tuple
 * passed to `invalidateQueries` / `removeQueries` / `setQueryData` should be
 * built from this factory — so renaming or restructuring a key is one edit,
 * not a grep-and-pray across components.
 *
 * Nested factories preserve TanStack Query's prefix-match semantics:
 * `removeQueries({ queryKey: queryKeys.project.all(id) })` clears the
 * project's summary, graph, and issues in one call.
 */

export const queryKeys = {
	auth: {
		all: ["auth"] as const,
		session: () => [...queryKeys.auth.all, "session"] as const,
		orgs: () => [...queryKeys.auth.all, "orgs"] as const
	},
	projects: {
		all: ["projects"] as const,
		list: (scope: "active" | "archived") => [...queryKeys.projects.all, scope] as const
	},
	project: {
		all: (id: string) => ["project", id] as const,
		summary: (id: string) => queryKeys.project.all(id),
		graph: (id: string) => [...queryKeys.project.all(id), "graph"] as const,
		issues: (id: string) => [...queryKeys.project.all(id), "issues"] as const,
		featureFlows: (id: string) => [...queryKeys.project.all(id), "feature-flows"] as const,
		featureFlow: (id: string, slug: string) =>
			[...queryKeys.project.featureFlows(id), slug] as const
	},
	integrations: {
		all: ["integrations"] as const,
		github: () => [...queryKeys.integrations.all, "github"] as const,
		githubRepos: (page: number, perPage: number) =>
			[...queryKeys.integrations.github(), "repos", page, perPage] as const
	},
	/** Cross-cutting prefixes — used by sign-out to clear the whole subtree. */
	prefixes: {
		project: ["project"] as const,
		integrations: ["integrations"] as const
	}
} as const
