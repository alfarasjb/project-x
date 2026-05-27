# syntax=docker/dockerfile:1.7

# ─── builder ─────────────────────────────────────────────────────────────
# Installs dev + prod deps and runs the Vite build. The output bundle goes
# to dist/web/; the runner stage copies it over alongside a prod-only
# install of node_modules.
FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.12.4 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# ─── runner ──────────────────────────────────────────────────────────────
# Slim runtime image. We re-install with --prod so tsx + @fastify/static +
# the rest of runtime deps land, but devDeps (eslint, vite, typescript, etc.)
# stay out. Source TS files are kept — tsx executes them directly at boot.
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@10.12.4 --activate

COPY package.json pnpm-lock.yaml ./
# --ignore-scripts: skip the `prepare` script (husky is a devDep — not
# present in this prod install — so the script would fail with
# `sh: husky: not found`). pnpm already skips approve-build-style dep
# postinstalls by default, so this only affects our prepare hook.
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Source needed at runtime: tsx loads server/**, shared/** at boot, and
# drizzle-kit migrate reads from drizzle/ + reads schema files referenced
# from drizzle.config.ts. Configs come along because tsx resolves the
# @server/ @shared/ path aliases via tsconfig.base.json.
COPY tsconfig.base.json tsconfig.json tsconfig.server.json drizzle.config.ts ./
COPY server ./server
COPY shared ./shared
COPY drizzle ./drizzle
COPY --from=builder /app/dist/web ./dist/web

EXPOSE 3100
CMD ["pnpm", "start"]
