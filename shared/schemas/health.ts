import { z } from "zod"

/** GET /api/health response — boot/liveness check for the Fastify server. */
export const HealthSchema = z.object({
	status: z.literal("ok"),
	mcp: z.object({
		status: z.literal("stub"),
		transport: z.literal("stdio")
	}),
	/** Server uptime in whole seconds. */
	uptime: z.number()
})
export type Health = z.infer<typeof HealthSchema>
