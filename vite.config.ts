import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { TanStackRouterVite } from "@tanstack/router-plugin/vite"
import path from "node:path"

// Fastify API port — keep in sync with `server/index.ts` (both honour PORT).
const API_PORT = process.env.PORT ?? "3100"

export default defineConfig({
	plugins: [
		TanStackRouterVite({ target: "react", autoCodeSplitting: true }),
		react(),
		tailwindcss()
	],
	resolve: {
		alias: {
			"@": path.resolve(import.meta.dirname, "./src"),
			"@shared": path.resolve(import.meta.dirname, "./shared")
		}
	},
	server: {
		port: 5173,
		proxy: {
			"/api": { target: `http://localhost:${API_PORT}`, changeOrigin: true },
			"/ws": { target: `ws://localhost:${API_PORT}`, ws: true }
		}
	}
})
