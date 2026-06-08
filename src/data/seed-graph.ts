import type { Graph } from "@shared/schemas/graph"

/**
 * Hand-built sample graph — a small web-app architecture.
 *
 * Demonstrates the full hierarchy: Module → File → Primitive.
 *   - Modules (folders) contain Files; Files contain Primitives.
 *   - Positions are explicit (no auto-layout). Each node's position is
 *     RELATIVE to its parent's top-left corner.
 *   - `p-token` (interface) and `p-maxretries` (constant) show that types and
 *     constants are first-class nodes. `p-login`'s return type carries a `ref`
 *     to `p-token` — the (future) clickable jump-to-declaration.
 */
export const seedGraph: Graph = {
	// Sample graph predates clustering; no subsystems to show.
	clusters: [],
	nodes: [
		// ── Modules ────────────────────────────────────────────────
		{
			id: "m-routes",
			path: "src/routes",
			kind: "module",
			label: "Routes",
			parentId: null,
			layer: "route",
			description: { what: "Page-level route handlers.", source: "ai" },
			position: { x: 430, y: 0 },
			size: { width: 292, height: 200 }
		},
		{
			id: "m-auth",
			path: "src/auth",
			kind: "module",
			label: "Auth Service",
			parentId: null,
			layer: "service",
			description: {
				what: "Authentication and JWT issuance.",
				why: "Centralizes credential checks so routes never touch raw auth logic.",
				source: "ai"
			},
			position: { x: 60, y: 280 },
			size: { width: 292, height: 484 }
		},
		{
			id: "m-db",
			path: "src/db",
			kind: "module",
			label: "Database",
			parentId: null,
			layer: "data",
			description: { what: "Postgres access layer.", source: "ai" },
			position: { x: 470, y: 820 },
			size: { width: 292, height: 272 }
		},
		{
			id: "m-ui",
			path: "src/components",
			kind: "module",
			label: "UI Components",
			parentId: null,
			layer: "ui",
			description: { what: "Shared UI component library.", source: "ai" },
			position: { x: 820, y: 280 },
			size: { width: 292, height: 200 }
		},
		// ── Files ──────────────────────────────────────────────────
		{
			id: "f-routes-index",
			path: "src/routes/index.ts",
			kind: "file",
			label: "index.ts",
			parentId: "m-routes",
			position: { x: 16, y: 64 },
			size: { width: 260, height: 124 }
		},
		{
			id: "f-auth-jwt",
			path: "src/auth/jwt.ts",
			kind: "file",
			label: "jwt.ts",
			parentId: "m-auth",
			position: { x: 16, y: 64 },
			size: { width: 260, height: 268 }
		},
		{
			id: "f-auth-service",
			path: "src/auth/service.ts",
			kind: "file",
			label: "service.ts",
			parentId: "m-auth",
			position: { x: 16, y: 348 },
			size: { width: 260, height: 124 }
		},
		{
			id: "f-db-index",
			path: "src/db/index.ts",
			kind: "file",
			label: "index.ts",
			parentId: "m-db",
			position: { x: 16, y: 64 },
			size: { width: 260, height: 196 }
		},
		{
			id: "f-ui-button",
			path: "src/components/button.tsx",
			kind: "file",
			label: "button.tsx",
			parentId: "m-ui",
			position: { x: 16, y: 64 },
			size: { width: 260, height: 124 }
		},
		// ── Primitives: routes/index.ts ────────────────────────────
		{
			id: "p-loginroute",
			path: "src/routes/index.ts#loginRoute",
			kind: "function",
			label: "loginRoute",
			parentId: "f-routes-index",
			description: { what: "Handles the POST /login request.", source: "ai" },
			signature: {
				parameters: [{ name: "req", type: { name: "Request" } }],
				returnType: { name: "Response" }
			},
			position: { x: 15, y: 40 }
		},
		// ── Primitives: auth/jwt.ts ────────────────────────────────
		{
			id: "p-login",
			path: "src/auth/jwt.ts#login",
			kind: "function",
			label: "login",
			parentId: "f-auth-jwt",
			description: { what: "Exchanges credentials for a signed token.", source: "ai" },
			signature: {
				parameters: [{ name: "credentials", type: { name: "Credentials" } }],
				returnType: { name: "Promise<Token>", ref: "p-token" }
			},
			position: { x: 15, y: 40 }
		},
		{
			id: "p-verify",
			path: "src/auth/jwt.ts#verifyToken",
			kind: "function",
			label: "verifyToken",
			parentId: "f-auth-jwt",
			description: {
				what: "Verifies a JWT and returns its decoded claims.",
				why: "Routes need a cheap, throwing check before serving protected data.",
				source: "ai"
			},
			signature: {
				parameters: [{ name: "token", type: { name: "string" } }],
				returnType: { name: "TokenClaims" }
			},
			position: { x: 15, y: 112 }
		},
		{
			id: "p-token",
			path: "src/auth/jwt.ts#Token",
			kind: "interface",
			label: "Token",
			parentId: "f-auth-jwt",
			description: { what: "A signed JWT plus its expiry metadata.", source: "ai" },
			position: { x: 15, y: 184 }
		},
		// ── Primitives: auth/service.ts ────────────────────────────
		{
			id: "p-authsvc",
			path: "src/auth/service.ts#AuthService",
			kind: "class",
			label: "AuthService",
			parentId: "f-auth-service",
			description: { what: "Coordinates login, token issuance, and verification.", source: "ai" },
			position: { x: 15, y: 40 }
		},
		// ── Primitives: db/index.ts ────────────────────────────────
		{
			id: "p-getdb",
			path: "src/db/index.ts#getDb",
			kind: "function",
			label: "getDb",
			parentId: "f-db-index",
			description: { what: "Returns the lazy Drizzle connection.", source: "ai" },
			signature: { parameters: [], returnType: { name: "Db" } },
			position: { x: 15, y: 40 }
		},
		{
			id: "p-maxretries",
			path: "src/db/index.ts#MAX_RETRIES",
			kind: "constant",
			label: "MAX_RETRIES",
			parentId: "f-db-index",
			description: {
				what: "Max retry count for a database connection.",
				why: "Retries are finite — caps a failing connection so it can't loop forever.",
				source: "manual"
			},
			position: { x: 15, y: 112 }
		},
		// ── Primitives: components/button.tsx ──────────────────────
		{
			id: "p-button",
			path: "src/components/button.tsx#Button",
			kind: "function",
			label: "Button",
			parentId: "f-ui-button",
			description: { what: "Themed button primitive.", source: "ai" },
			signature: {
				parameters: [{ name: "props", type: { name: "ButtonProps" } }],
				returnType: { name: "JSX.Element" }
			},
			position: { x: 15, y: 40 }
		}
	],
	edges: [
		// module-level dependency edges
		{ id: "e-routes-auth", source: "m-routes", target: "m-auth", kind: "dependency" },
		{ id: "e-routes-ui", source: "m-routes", target: "m-ui", kind: "dependency" },
		{ id: "e-auth-db", source: "m-auth", target: "m-db", kind: "dependency" },
		// primitive-level edges — these roll up into the module edges above
		{ id: "e-loginroute-login", source: "p-loginroute", target: "p-login", kind: "dependency" },
		{ id: "e-verify-getdb", source: "p-verify", target: "p-getdb", kind: "dependency" },
		{ id: "e-authsvc-getdb", source: "p-authsvc", target: "p-getdb", kind: "dependency" },
		{ id: "e-login-authsvc", source: "p-login", target: "p-authsvc", kind: "data-flow" }
	]
}
