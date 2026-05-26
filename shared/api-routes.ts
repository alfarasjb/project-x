/**
 * Single source of truth for the HTTP API surface.
 *
 * Both sides import from here so the path can only be wrong in one place:
 *   - `apiRoutePatterns` — Fastify-style templates with `:id` placeholders,
 *     used by server route registrations.
 *   - `apiRoutes` — builder functions for the same routes, used by frontend
 *     fetch callers.
 *
 * The two are paired by key. Add a new endpoint by adding to BOTH objects;
 * a missing key on either side is a type error.
 */

export const apiRoutePatterns = {
	projectsList: "/api/projects",
	project: "/api/projects/:id",
	projectArchive: "/api/projects/:id/archive",
	projectUnarchive: "/api/projects/:id/unarchive",
	projectRename: "/api/projects/:id/rename",
	projectGraph: "/api/projects/:id/graph",
	projectCrawl: "/api/projects/:id/graph/crawl",
	projectAnalyze: "/api/projects/:id/analyze",
	projectIssues: "/api/projects/:id/issues",
	integrationGithub: "/api/integrations/github",
	integrationGithubDisconnect: "/api/integrations/github/disconnect",
	integrationGithubRepos: "/api/integrations/github/repos"
} as const

export const apiRoutes = {
	projectsList: "/api/projects",
	project: (id: string) => `/api/projects/${id}`,
	projectArchive: (id: string) => `/api/projects/${id}/archive`,
	projectUnarchive: (id: string) => `/api/projects/${id}/unarchive`,
	projectRename: (id: string) => `/api/projects/${id}/rename`,
	projectGraph: (id: string) => `/api/projects/${id}/graph`,
	projectCrawl: (id: string) => `/api/projects/${id}/graph/crawl`,
	projectAnalyze: (id: string) => `/api/projects/${id}/analyze`,
	projectIssues: (id: string) => `/api/projects/${id}/issues`,
	integrationGithub: "/api/integrations/github",
	integrationGithubDisconnect: "/api/integrations/github/disconnect",
	integrationGithubRepos: (page = 1, perPage = 30) =>
		`/api/integrations/github/repos?page=${page}&per_page=${perPage}`
} as const
