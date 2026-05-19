import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { TanStackRouterVite } from "@tanstack/router-plugin/vite"
import path from "node:path"

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
			"/api": { target: "http://localhost:3000", changeOrigin: true },
			"/ws": { target: "ws://localhost:3000", ws: true }
		}
	}
})
