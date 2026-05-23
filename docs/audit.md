# Architecture Audit — Classification (v1)

The audit needs every file/module in your project classified by its **role**
(business-logic, routing, data-access, ui-component, utility, config,
type-definition). Classifications drive the audit rules — e.g. a
`business-logic` function in a `routing` file fires a boundary-violation
issue.

> **v1 is MCP-driven.** Claude Code reads the actual file contents and
> writes classifications back through the MCP server. Server-side AI
> classification (no MCP client in the loop) replaces this later.

## Prerequisites

1. `.mcp.json` at the repo root registers the `project-x` MCP server. If
   you started Claude Code before adding `project-x` to your DB, restart it.
2. A crawled project. Click **Crawl** on the project's dashboard once so
   the graph exists.
3. Run `pnpm tsx --tsconfig tsconfig.server.json server/db/doctor.ts <email>`
   if you want to verify the graph + classifications later.

## Bulk-classify the project

Open this repo in Claude Code, then paste this prompt:

> Classify every unclassified file and module in this project.
>
> 1. Call `projectx_list_nodes` with `classified=false` and `kind=file`.
>    Process every file returned (paginate with `offset` if needed).
> 2. For each unclassified file: read it (use the Read tool with the path
>    from the node's `path` field), then call `projectx_classify_node` with
>    the best fit from this enum:
>    - `business-logic` — domain operations: auth flows, payment processing,
>      the rules that make the product the product
>    - `routing` — HTTP routes / request handlers / page routes; thin glue
>      to the domain
>    - `data-access` — DB queries, persistence, ORM models, schema, migrations
>    - `ui-component` — React/Vue/Svelte components, UI primitives
>    - `utility` — generic helpers with no domain knowledge (formatters,
>      `cn`, lodash-likes)
>    - `config` — env loading, build/lint/runtime config, app wiring
>    - `type-definition` — pure type/interface declarations, schema-as-types
>    - `unknown` — genuinely can't tell after reading; safer than guessing
> 3. Repeat for `kind=module` (directories). For a module, the file children's
>    classifications are usually enough signal — but glance at a README or
>    representative file if it's not obvious.
>
> Read each file before classifying. The whole point is that the path alone
> isn't reliable.

That's it. The classifications persist on the project's graph and survive
re-crawls (they're carried over by `node.path` match).

## Spot-checking the result

- `projectx_list_nodes classified=true` to see what's been classified
- `projectx_get_node node_id=<path>` to inspect a specific node
- The `actual_graph` JSONB column on the `projects` row has it all if you
  prefer a DB peek

## Future direction

The MCP-driven flow is a temporary scaffold for the dogfooding milestone.
Once we've validated that AI classifications drive useful audit rules, we'll
move classification server-side (Anthropic API called during crawl) so it
runs automatically without an MCP client in the loop. The schema stays the
same — only the producer changes.
