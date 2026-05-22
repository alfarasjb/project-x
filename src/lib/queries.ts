import { queryOptions } from "@tanstack/react-query"
import { GraphSchema } from "@shared/schemas/graph"
import { HealthSchema } from "@shared/schemas/health"
import { apiGet } from "./api"

/**
 * Query definitions — one per server resource. Each returns a `queryOptions`
 * object usable from both a route loader (`prefetchQuery`) and a component
 * (`useQuery`), so the query key and fetcher are declared exactly once.
 */

/** The parsed architecture graph. Re-parse will invalidate `["graph"]`. */
export const graphQueryOptions = () =>
	queryOptions({
		queryKey: ["graph"],
		queryFn: () => apiGet("/api/graph", GraphSchema)
	})

/** Server liveness + MCP status. */
export const healthQueryOptions = () =>
	queryOptions({
		queryKey: ["health"],
		queryFn: () => apiGet("/api/health", HealthSchema)
	})
