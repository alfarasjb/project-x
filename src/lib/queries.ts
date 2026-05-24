import { queryOptions } from "@tanstack/react-query"
import { z } from "zod"
import { apiRoutes } from "@shared/api-routes"
import { GraphSchema } from "@shared/schemas/graph"
import { IssuesSchema } from "@shared/schemas/issue"
import { ProjectSchema } from "@shared/schemas/project"
import { apiGet } from "./api"
import { queryKeys } from "./query-keys"

/**
 * Query definitions — one per server resource. Each returns a `queryOptions`
 * object usable from both a route loader (`prefetchQuery`) and a component
 * (`useQuery`), so the query key and fetcher are declared exactly once.
 *
 * Keys come from `query-keys.ts`; URLs come from `@shared/api-routes`.
 */

const ProjectListSchema = z.array(ProjectSchema)

/** The project list — active projects, or archived ones when `archived` is set. */
export const projectsQueryOptions = (opts?: { archived?: boolean }) => {
	const archived = opts?.archived ?? false
	return queryOptions({
		queryKey: queryKeys.projects.list(archived ? "archived" : "active"),
		queryFn: () =>
			apiGet(
				archived ? `${apiRoutes.projectsList}?archived=true` : apiRoutes.projectsList,
				ProjectListSchema
			)
	})
}

/** A single project's summary. */
export const projectQueryOptions = (projectId: string) =>
	queryOptions({
		queryKey: queryKeys.project.summary(projectId),
		queryFn: () => apiGet(apiRoutes.project(projectId), ProjectSchema)
	})

/** A project's stored graph. A crawl overwrites this in the cache. */
export const graphQueryOptions = (projectId: string) =>
	queryOptions({
		queryKey: queryKeys.project.graph(projectId),
		queryFn: () => apiGet(apiRoutes.projectGraph(projectId), GraphSchema)
	})

/** A project's audit issues — written by every crawl, never edited directly. */
export const issuesQueryOptions = (projectId: string) =>
	queryOptions({
		queryKey: queryKeys.project.issues(projectId),
		queryFn: () => apiGet(apiRoutes.projectIssues(projectId), IssuesSchema)
	})
