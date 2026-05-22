# Project X — Architectural Co-Pilot

> An architectural supplement for Claude Code.

You design a feature as a change to your architecture graph. That graph becomes
the spec the agent builds against — and the code is then held to it.

The graph is a **live diff between intended architecture and actual
implementation**. When they diverge, you see it immediately.

## The loop

1. **Design** — describe a feature in chat; Project X proposes it as a graph
   change (new modules, nodes, edges, constraints).
2. **Approve** — accept or reject the proposal on the canvas, before any code
   is written.
3. **Build** — Claude Code reads the intended graph over MCP and implements
   against it.
4. **Verify** — a parser produces the *actual* graph from the code; drift shows
   where reality diverged from intent.

The design artifact, the spec the agent builds from, and the durable record of
intent are the **same thing** — a graph that isn't thrown away when the feature
ships.

## Why it exists

AI agents are productive entropy. They ship features fast and erode
architecture faster — strong local decisions, no bird's-eye view — and you find
out only when the codebase is already a mess, because nothing was watching the
structure.

In an AI-assisted codebase, you are the only architectural memory, and you are
badly outnumbered by the agent's output. Project X is the persistent
architectural conscience that isn't you.

Claude Code is session-scoped and file-scoped — it has no memory of *why* your
architecture is shaped the way it is. Project X supplies exactly that, and
nothing else.

## What it solves

**Designing a feature is throwaway work today.** Before a non-trivial change
you write an architecture doc — "extend these schemas, touch this code" — that
is unstructured, goes stale the moment the feature ships, and is never
enforced. Project X makes that artifact structured, living, and checked against
the code.

**AI agents drift architecturally.** A UI component imports the DB directly; a
route bypasses the service layer. No code diff shows it. Project X diffs intent
against parsed reality, surfaces the drift, and feeds the constraints to the
agent *before* it generates.

**Architecture changes are unreviewable.** You review code diffs, not
architecture diffs. Project X has agents propose *graph* changes — approved or
rejected on the canvas before code is touched.

**Intended architecture lives nowhere — or somewhere stale.** It's in someone's
head or a months-old diagram. Project X makes intent an explicit artifact,
continuously diffed against reality, so it can't go stale silently.

**And the graph doubles as the agent's knowledge base.** Because every module,
file, and symbol is an indexed node, an agent can ask "does a constant for *X*
already exist?" instead of grepping, missing it, and declaring a duplicate —
and pull just the relevant slice of a large codebase instead of the whole
thing.

## Getting started

```sh
pnpm install
cp .env.example .env          # credentials already match docker-compose.yml
docker compose up -d          # local Postgres
pnpm db:generate              # generate the first migration
pnpm db:migrate               # apply it
pnpm dev                      # boot Vite (5173) + Fastify (3100)
```

`pnpm dev` boots without a database — the home page and MCP stub run fine; the
DB is only needed once you query graphs. Visit **`/graph`** to see the seeded
sample graph on the canvas.

See [`CLAUDE.md`](./CLAUDE.md) for the full stack, commands, conventions, and
project-specific gotchas.

## Status

Early. The graph schema, a hand-seeded sample graph, and a ReactFlow canvas
(`/graph`) with collapsible modules are in place. The ts-morph parser and the
MCP tool surface are next.

## Reference

The PRD is the source of truth:
[Project X — Architectural Co-Pilot](https://www.notion.so/Project-X-Architectural-Co-Pilot-3655d013a2f481b3a213c98c8b696bbc)
