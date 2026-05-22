import { queryOptions } from "@tanstack/react-query"
import { z } from "zod"
import { GraphSchema } from "@shared/schemas/graph"
import { ProjectSchema } from "@shared/schemas/project"
import { apiGet } from "./api"

/**
 * Query definitions — one per server resource. Each returns a `queryOptions`
 * object usable from both a route loader (`prefetchQuery`) and a component
 * (`useQuery`), so the query key and fetcher are declared exactly once.
 *
 * Key convention: `["projects", …]` for lists, `["project", id, …]` for a
 * single project and anything scoped to it.
 */

const ProjectListSchema = z.array(ProjectSchema)

/** The project list — active projects, or archived ones when `archived` is set. */
export const projectsQueryOptions = (opts?: { archived?: boolean }) => {
	const archived = opts?.archived ?? false
	return queryOptions({
		queryKey: ["projects", archived ? "archived" : "active"],
		queryFn: () =>
			apiGet(archived ? "/api/projects?archived=true" : "/api/projects", ProjectListSchema)
	})
}

/** A single project's summary. */
export const projectQueryOptions = (projectId: string) =>
	queryOptions({
		queryKey: ["project", projectId],
		queryFn: () => apiGet(`/api/projects/${projectId}`, ProjectSchema)
	})

/** A project's stored graph. A crawl overwrites this in the cache. */
export const graphQueryOptions = (projectId: string) =>
	queryOptions({
		queryKey: ["project", projectId, "graph"],
		queryFn: () => apiGet(`/api/projects/${projectId}/graph`, GraphSchema)
	})
