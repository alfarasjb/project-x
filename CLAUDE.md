# Project X — Architectural Co-Pilot

> Bidirectional architecture visualization tool. A ReactFlow canvas defines intended architecture; a ts-morph parser produces the actual graph from code; the divergence is surfaced as drift. An MCP server lets AI coding agents read the graph and propose changes.

**Status:** Scaffold landed 2026-05-19. `pnpm install && pnpm dev` boots Vite (5173) + Fastify (3100). MCP stdio stub returns an empty `archlens://graph` resource. No business logic yet.

## Canonical reference

The PRD is the source of truth. Fetch before scope/architecture decisions:

- **Notion PRD:** https://www.notion.so/Project-X-Architectural-Co-Pilot-3655d013a2f481b3a213c98c8b696bbc

## Stack

| Layer        | Choice                                                                                                     |
| ------------ | ---------------------------------------------------------------------------------------------------------- |
| Frontend     | Vite + React + TanStack Router + Zustand                                                                   |
| Canvas       | @xyflow/react (ReactFlow)                                                                                  |
| UI           | shadcn/ui + Tailwind v4 (OKLCH theme) + Lucide icons                                                       |
| Fonts        | Inter (sans) + Space Grotesk (display)                                                                     |
| Backend      | Fastify + fastify-websocket                                                                                |
| Parser       | ts-morph                                                                                                   |
| File watcher | chokidar                                                                                                   |
| MCP          | @modelcontextprotocol/sdk (stdio for local, SSE for remote)                                                |
| Validation   | Zod at every boundary                                                                                      |
| Storage      | Postgres. Graph state (intent + actual) as JSONB columns on `projects`. Users/projects/billing relational. |
| Billing      | Stripe                                                                                                     |
| Deploy       | Railway                                                                                                    |

## Commands

| Script                 | What it does                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm dev`             | Boot Vite (5173) + Fastify (3100) concurrently                                                                                 |
| `pnpm dev:web`         | Vite only                                                                                                                      |
| `pnpm dev:server`      | Fastify only (tsx watch)                                                                                                       |
| `pnpm mcp`             | Run the MCP stdio server (for `claude mcp add` or local connection)                                                            |
| `pnpm typecheck`       | `tsc -b` across web + server projects                                                                                          |
| `pnpm lint`            | ESLint flat config                                                                                                             |
| `pnpm format`          | Prettier write                                                                                                                 |
| `pnpm build:web`       | Vite production build (frontend only — server build TBD)                                                                       |
| `pnpm routes:generate` | Regenerate `src/routeTree.gen.ts` via the TanStack Router CLI (`tsr generate`) — needed before `typecheck` on a fresh checkout |
| `pnpm db:generate`     | Drizzle generate migrations from schema                                                                                        |
| `pnpm db:migrate`      | Apply migrations to `DATABASE_URL`                                                                                             |
| `pnpm db:studio`       | Open Drizzle Studio                                                                                                            |

Env var: `DATABASE_URL` (postgres) — **required**. Graph state and the relational tables both live there. `@server/env` loads `.env` (dotenv) and validates it with Zod at import time, so the Fastify server fails fast at boot with a clear message if it's unset — import the typed `env` object rather than reading `process.env`. The MCP stub (`pnpm mcp`) doesn't load `@server/env`, so it still boots without a database.

## First-time setup

```sh
pnpm install
cp .env.example .env          # credentials already match docker-compose.yml
docker compose up -d          # local Postgres 18 on :5544 (host port, not 5432)
pnpm db:generate              # generate the first migration from schema
pnpm db:migrate               # apply it
pnpm dev                      # boot Vite + Fastify
```

`docker-compose.yml` runs Postgres only. `docker compose down -v` wipes the data volume.

## Key file locations

```
project-x/
├── server/
│   ├── index.ts              # Fastify entry, registers routes, GET /api/health
│   ├── env.ts                # dotenv + Zod-validated env (import `env`, not process.env)
│   ├── domain/
│   │   ├── tenancy.ts        # ensureDefaultOrg() — org stub, the multi-tenancy seam
│   │   ├── project.ts        # project CRUD: list/get/create/archive/unarchive
│   │   └── graph/index.ts    # getProjectGraph / saveActualGraph / crawlProject
│   ├── routes/
│   │   ├── projects.ts       # /api/projects CRUD
│   │   └── graph.ts          # /api/projects/:id/graph (read) + /graph/crawl
│   ├── utils/errors.ts       # AppError — HTTP-status error, caught at the boundary
│   ├── parser/               # ts-morph parser (index.ts, typescript.ts)
│   ├── mcp/index.ts          # MCP stdio server, registers archlens://graph
│   └── db/
│       ├── index.ts          # Lazy Drizzle connection
│       └── schema/
│           ├── common.ts     # pgSchema('projectx') + timestamp helpers
│           └── projects.ts   # projects table — intent_graph + actual_graph JSONB columns
├── src/                      # frontend
│   ├── main.tsx              # React entry, RouterProvider
│   ├── routes/
│   │   ├── __root.tsx        # Root layout + devtools
│   │   ├── index.tsx         # / — project browser
│   │   └── projects.$projectId.tsx  # /projects/:id — graph canvas
│   ├── routeTree.gen.ts      # (auto-generated by router plugin, gitignored)
│   ├── app/globals.css       # OKLCH tokens in @theme inline + .dark swap
│   ├── components/{graph,project}/  # UI components
│   ├── data/seed-graph.ts    # starter graph for future project creation (unwired)
│   └── lib/{api,queries,query-client,utils}.ts
├── shared/
│   └── schemas/{graph,health,project}.ts   # Zod boundary schemas
├── drizzle/                  # Generated migrations
├── .claude/
│   ├── skills/{mcp-builder,frontend-design,tailwind-v4-shadcn}/
│   └── agents/{code-reviewer,functionality-reviewer,code-quality-reviewer}.md
├── drizzle.config.ts
├── eslint.config.ts
├── vite.config.ts
├── components.json           # shadcn config
├── tsconfig.{base,web,server}.json
└── package.json
```

## Skills installed

The `.claude/skills/` folder contains:

- **`mcp-builder`** (Anthropic) — 4-phase workflow for building the MCP server, Zod input/output schemas, tool annotations, MCP Inspector testing
- **`frontend-design`** (Anthropic) — Anti-generic-AI aesthetic guidance: typography, OKLCH color systems, motion as high-impact moments, asymmetric composition
- **`tailwind-v4-shadcn`** (secondsky) — Tailwind v4 + shadcn + Vite specifics: `@theme inline`, OKLCH variables, dark mode via `.dark` selector, CVA component patterns

**After `package.json` is initialized**, also run:

```sh
pnpm dlx skills add shadcn/ui
```

This installs the official shadcn/ui skill which reads `components.json` for project-aware component generation.

## Reference projects

Mirror these conventions; re-explore the codebases when in doubt:

- **Code quality & best practices:** [D:\Files\Repositories\PioneerDevAI\Patentext\origin](D:\Files\Repositories\PioneerDevAI\Patentext\origin) — strict tsconfig, Zod boundaries, `AppError` class, colocated `__tests__/`, ESLint flat config, no-semi prettier
- **UI & design:** [D:\Files\Repositories\PioneerDevAI\PromptWise](D:\Files\Repositories\PioneerDevAI\PromptWise) — OKLCH tokens, `@theme inline`, CVA variants, custom `@keyframes`, Lucide icons. We use shadcn primitives instead of base-ui but otherwise mirror this design language.
- **Abstractions:** [D:\Files\Repositories\PioneerDevAI\filipina-meet-app](D:\Files\Repositories\PioneerDevAI\filipina-meet-app) — `domain/` vs `utils/` split, custom error classes, thin fetch wrapper, Zustand per concern + no god-store

## Conventions (high-signal summary)

Full conventions live in `.claude/projects/.../memory/project_x_conventions.md`. Highlights:

- **TS strictness:** `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`. No `any`. No relative imports — always use the `@/`, `@server/`, `@shared/` aliases. `moduleResolution: bundler`, no `.js` import extensions.
- **Errors:** Custom `AppError extends Error` with `statusCode` / `cause` / `details`. Caught once at request boundary. Zod at every boundary.
- **File layout:** Routes call `domain/`, never `utils/` directly. `shared/schemas/` for Zod. No barrel files — import the named module file directly.
- **Design:** OKLCH CSS vars in `@theme inline`. Dark mode via `.dark` selector property swap, not Tailwind `dark:` prefix. CVA for component variants — no `className` pile-ups at call sites.
- **State:** Zustand per concern. React Context only for cross-cutting live state (WebSocket). No Redux.
- **Tests:** Node `test` runner, colocated `__tests__/`, no DB mocks.
- **Abstractions:** Extract on the 2nd repetition. Premature helpers are a flag.

## Project-specific gotchas

- **Vite plugin order:** `@vitejs/plugin-react` must come before `@tanstack/router-plugin/vite`. Reversed order silently breaks routing.
- **ReactFlow stylesheet:** Always `import '@xyflow/react/dist/style.css'` at the app root. Edges silently fail to render without it.
- **ReactFlow handler stability:** Event handlers passed to `<ReactFlow>` must be wrapped in `useCallback` or defined outside the component — otherwise infinite re-render loop.
- **`nodeTypes` / `edgeTypes`:** Define once at module scope. Re-creating these objects per render breaks ReactFlow's internals.
- **MCP transport:** stdio for local Claude Code integration, SSE for remote agents. We support both.
- **The graph isn't a blueprint:** It's the live diff between intent (user-edited graph) and reality (parsed graph). When making product decisions, always ask: "does this preserve the diff semantics?"
- **The graph is DB-backed, crawl is explicit:** `GET /api/projects/:id/graph` reads the stored `actual_graph` JSONB — it never re-parses. `POST /api/projects/:id/graph/crawl` re-parses the project's repo and persists the result. The UI "Crawl" button is the only thing that refreshes the parsed graph; a page refresh is a cheap DB read.
- **Projects are explicit, removal is soft:** each project is bound to a local repo `rootPath`; the `/` browser creates/lists/opens them. Archive sets `archivedAt` (the row + crawled graph survive); `/:id/unarchive` reverses it. There is no hard delete.
- **Tenancy is stubbed:** `server/domain/tenancy.ts` — `ensureDefaultOrg()` is a constant-id placeholder, not yet consumed. Multi-tenancy (orgs, auth) is deferred — it's the seam where real session/membership checks plug in later. Projects are real (`server/domain/project.ts`); orgs are not.
- **drizzle-kit reads the root `tsconfig.json`:** it must `extends` `tsconfig.base.json` so the `@server/ @shared/` aliases in the schema files resolve during `db:generate`.

## Workflow

- Use `code-reviewer` agent before any non-trivial merge — it enforces the conventions above
- Use `mcp-builder` skill when extending the MCP server's tools/resources
- Use `frontend-design` + `tailwind-v4-shadcn` skills when building canvas chrome, dashboard pages, or new components
- **CI** (`.github/workflows/ci.yml`) gates every PR on typecheck + build + lint. A husky pre-commit hook runs `lint-staged` (eslint --fix + prettier) on staged files — committing reformats them.
