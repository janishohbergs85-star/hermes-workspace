# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Hermes Workspace is a **TanStack Start** (React 19 + Vite 7) full-stack web app that acts
as the UI/control plane for **Hermes Agent** (`NousResearch/hermes-agent`). The workspace
is a thin client: it owns no model logic. It talks to two backend services over HTTP and
degrades gracefully when they are missing:

- **Gateway** (`:8642`) — chat, models, streaming, jobs. Core OpenAI-compatible APIs.
- **Dashboard** (`:9119`) — sessions, skills, config, MCP. Optional "enhanced" features.

When both are reachable the app runs in **enhanced mode**; when only an OpenAI-compatible
endpoint answers it falls back to **portable mode** (chat only, sessions/skills/memory show
"Not Available"); with nothing reachable it is **disconnected**. This capability probing is
central to the architecture — see `src/server/gateway-capabilities.ts`.

This is **zero-fork** as of v2: it runs against vanilla upstream `hermes-agent`, not a fork.

## Commands

Package manager is **pnpm** (Node 22+). There is a `pnpm-workspace.yaml` (the
`playground-ws-worker` package is a member).

```bash
pnpm install                  # install deps
pnpm dev                      # dev server on :3000 (override with PORT=4000)
pnpm build                    # production build → dist/{client,server}
pnpm start                    # serve the built app via server-entry.js
pnpm start:all                # gateway + dashboard + dev server together (concurrently)

pnpm test                     # vitest run (full suite)
pnpm exec vitest run path/to/file.test.ts   # run a single test file
pnpm exec vitest run -t "name of test"      # run tests matching a name
pnpm exec vitest                            # watch mode

pnpm lint                     # eslint
pnpm exec tsc --noEmit        # typecheck (there is NO `typecheck` script; CI falls back to this)
pnpm check                    # prettier --write . && eslint --fix (format + autofix)
```

Tests are colocated as `*.test.ts(x)` next to source (no separate test dir). Vitest config
lives inside `vite.config.ts` (the `test:` block), not a standalone file. Some browser-level
checks live in `e2e/*.spec.ts` (Playwright) — these are not part of `pnpm test`.

Electron desktop build (in development): `pnpm electron:dev`, `pnpm electron:build`.

The app **requires a running Hermes Agent backend** to do anything useful. The Vite dev
server will attempt to auto-start a local `hermes-agent` if it finds one (see the
`resolveClaudeAgentDir` chain in `vite.config.ts`); otherwise point `HERMES_API_URL` at an
existing gateway. See README.md for full pairing instructions.

## Architecture

### Full-stack routing (TanStack Start)
File-based routing under `src/routes/`. `src/routeTree.gen.ts` is **generated** — never edit
it by hand (it regenerates on dev/build). The same file-route system serves both pages and
the HTTP API:

- **Pages**: `src/routes/*.tsx` (e.g. `chat`, `dashboard`, `swarm`, `mcp`, `settings`).
  Page components are thin; the real UI lives in `src/screens/<feature>/`.
- **API**: `src/routes/api/**` files export a `Route` with `server.handlers.{GET,POST,...}`.
  These run server-side and are the workspace's backend. See `src/routes/api/ping.ts` for
  the canonical minimal shape.

### Server layer
`src/server/` holds all backend logic imported by the API route handlers (capability probing,
proxying to gateway/dashboard, swarm orchestration, stores, auth). It is plain TS modules, not
routes. Notable pieces:

- `gateway-capabilities.ts` — resolves backend URLs, probes capabilities, exports `CLAUDE_API`
  / `CLAUDE_DASHBOARD_URL`, `dashboardFetch`, mode/capability types. Most routes start by
  calling `ensureGatewayProbed()`.
- `auth-middleware.ts` — session token + password auth. **Every API handler must gate access**
  with `requireLocalOrAuth(request)` (returns 401 otherwise). Follow the existing pattern.
- `swarm-*.ts` — the Swarm control plane (persistent tmux-backed Hermes Agent workers, roster,
  missions, kanban, checkpoints, lifecycle). This is a large subsystem; `swarm.yaml` is the
  source-of-truth roster config.
- `mcp-hub/` — MCP catalog/marketplace/sources aggregation.

### Client state
Global state is **Zustand** stores in `src/stores/` (chat, sessions, agent swarm, tasks,
terminal, workspace). Server data fetching uses **TanStack Query**. Shared client helpers
(API clients, feature gates, theming, i18n) live in `src/lib/`.

### Capability gating
Features that need an upstream endpoint must check `feature-gates` / probed capabilities and
render a clean "not available / needs setup" placeholder rather than erroring mid-action.
Conductor is the prime example: it uses the dashboard mission API when present and falls back
to a Workspace-native Swarm dispatch (`mode: native-swarm`) when absent.

### Production server
`server-entry.js` is the Node entrypoint for `pnpm start`: it serves `dist/client` statically
and falls through to the TanStack SSR handler (`dist/server/server.js`). It contains the
**fail-closed security guard** — refuses to bind a non-loopback `HOST` unless `HERMES_PASSWORD`
is set (override only with `HERMES_ALLOW_INSECURE_REMOTE=1`).

## Conventions

### Naming contract (important)
Canonical product names are **Hermes Workspace**, **Hermes Agent**, **Swarm**, **HERMES_HOME**,
`~/.hermes` (see `docs/hermes-workspace-naming-contract.md`). However, the codebase carries
heavy **Claude-era legacy residue**: many files/symbols/env vars are prefixed `claude-*` /
`CLAUDE_*` (e.g. `claude-agent.ts`, `claude-api.ts`, `CLAUDE_API`, `CLAUDE_API_URL`). These are
intentional and still functional. Rules:

- In **new** UI, docs, prompts, and tests use the Hermes names.
- Legacy `claude-*` filenames and identifiers are kept for stability — don't mass-rename them.
- Env vars are read **Hermes-first with Claude fallback**: e.g. `HERMES_API_URL || CLAUDE_API_URL`,
  `HERMES_PASSWORD || CLAUDE_PASSWORD`, `HERMES_API_TOKEN || CLAUDE_API_TOKEN`. Preserve both
  when touching env handling.

### Other conventions
- Path alias: `@/*` → `src/*` (configured in both `tsconfig.json` and Vite).
- ESM throughout (`"type": "module"`); Electron/CJS entrypoints use `.cjs`.
- Match surrounding code style; run `pnpm check` before committing. CI (`.github/workflows/ci.yml`)
  runs lint, typecheck, build, and tests on PRs to `main`/`production`.
- Security posture is fail-closed by default (loopback-only bind, auth on every route,
  path-traversal real-path checks, CSP). Don't loosen these without an explicit env opt-in.

## Multi-agent / Swarm context

`AGENTS.md` defines the semantic Hermes worker roster (orchestrator, builder, reviewer, qa,
researcher, ops-watch, maintainer, etc.) used by Swarm mode, with per-worker profiles under
`agents/<worker-id>/`. `swarm.yaml` is the routing source of truth — keep `swarm.yaml`, the
worker profile config, role core skills, and wrappers aligned when changing a worker. Builder
implements, Reviewer gates, QA verifies, Orchestrator routes and enforces the greenlight gate.
