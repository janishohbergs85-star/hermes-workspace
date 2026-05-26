# Hermes — Consolidated Overview & Research Notes

> A single-page distillation of what Hermes is, how the pieces fit, and what the official sources say. Compiled 2026-05-26 from the in-repo docs plus the public upstream `outsourc-e/hermes-workspace` and `NousResearch/hermes-agent`.

## What it is (two layers)

| Layer | Repo | Role |
|-------|------|------|
| **Hermes Agent** | `NousResearch/hermes-agent` (Python/FastAPI) | The agent runtime + **gateway** (default port **8642**) and optional **dashboard**. Provides `/v1/models`, `/api/sessions`, `/api/skills`, `/api/config`, `/api/jobs`. CLI command: `hermes`. |
| **Hermes Workspace** | `outsourc-e/hermes-workspace` (Node/React/Vite) — **this repo** | A web "command center" UI (port **3000**) that talks to a vanilla Hermes Agent gateway. Chat, Memory, Skills, MCP, Files+Terminal, Operations, Conductor, Agent View, Swarm, Dashboard. |

**"Zero-fork" (v2.0.0+):** the Workspace runs against *vanilla* Hermes Agent — clone the Workspace, don't fork the agent. Features that need upstream endpoints degrade gracefully (capability gates) instead of failing.

## Install paths (official)

1. **One-line installer** — `curl -fsSL https://raw.githubusercontent.com/outsourc-e/hermes-workspace/main/install.sh | bash`. Installs `hermes-agent` via **Nous's official installer**, clones the workspace, sets up `.env`, installs deps. Then `hermes gateway run` (terminal 1) + `pnpm dev` (terminal 2).
2. **Docker Compose** — `docker compose up` pulls `nousresearch/hermes-agent:latest` (gateway :8642) + `ghcr.io/outsourc-e/hermes-workspace:latest` (UI :3000). State persists in the **`hermes-agent-data`** volume (+ `hermes-workspace-files`).
3. **Attach to existing agent** — clone workspace, `pnpm install`, point `HERMES_API_URL=http://127.0.0.1:8642` at a running gateway.

> **Hermes Agent itself is NOT on PyPI.** Install is the installer script (`curl …/scripts/install.sh | bash`) or from source (`git clone … && uv pip install -e ".[all]"`). The old "`pip install hermes-agent`" wording was incorrect and has been corrected in the CHANGELOG.

## Configuration / environment (canonical names)

- `HERMES_API_URL` — gateway backend (default `http://127.0.0.1:8642`).
- `HERMES_API_TOKEN` — must match the gateway secret or requests 401.
- `HERMES_HOME` — agent home (default `~/.hermes`). Resolution chain in code: `HERMES_HOME → CLAUDE_HOME → ~/.hermes`.
- `HERMES_PASSWORD` — web-UI password; **required** before binding off-loopback (`HOST=0.0.0.0`).
- `HERMES_ALLOW_INSECURE_REMOTE` — fail-closed guard for plain-HTTP remote binding.
- `HERMES_DASHBOARD_URL` — optional dashboard backend for split-host deployments.
- **Legacy back-compat:** `CLAUDE_HOME`, `CLAUDE_PASSWORD`, `CLAUDE_ALLOW_INSECURE_REMOTE` are still honored for pre-rename setups. "Claude" also remains a legitimate **model-provider** name (e.g. OAuth creds at `~/.claude/.credentials.json`) — distinct from the product brand.

## Memory model (local-first)

- **Memory is local-fs first** (since v2.0.0): it honors `HERMES_HOME` and has **no gateway dependency** — the agent reads/writes markdown under the home dir directly. Browse/search/edit via the Workspace Memory page.
- In this repo, `memory/` holds the agent's working memory: dated daily notes, `goals/<slug>/` with `iterations/NNN.md`, and `swarm/missions/`. These are durable, human-readable post-mortems and handoffs (e.g. `…/009-3002-root-cause-found.md` is a model debugging write-up).
- **"Use local, and remote only as much as necessary":** keep `HERMES_HOME` pointed at a local path and rely on the local-fs memory store; the gateway/dashboard are only needed for live sessions, model routing, and aggregated dashboard surfaces — not for memory persistence. (Note: this knowledge bank documents the intended config; it cannot reconfigure a live agent that isn't running in this container.)

## Swarm (the multi-agent control plane)

- **Source of truth = `swarm.yaml`** (routing) + a profile per worker under `~/.hermes/profiles/<worker-id>/`, a `<worker-id>-core` role skill, and a `~/.local/bin/` wrapper. `AGENTS.md` mirrors the roster.
- **Current semantic roster (10):** `orchestrator`, `km-agent`, `builder`, `reviewer`, `qa`, `researcher`, `ops-watch`, `maintainer`, `strategist`, `inbox-triage`.
- Operating rules: keep `swarm.yaml` / profile `config.yaml` / core skills / wrappers aligned; GBrain-first lookup; Builder implements → Reviewer gates → QA verifies → Orchestrator routes.
- **Doc caveat:** the prose under `docs/swarm/` still describes an older `swarm1–swarm12` numbered roster and is **out of date** vs. `swarm.yaml` (tracked as H3/H4 in the audit). Trust `swarm.yaml` + `AGENTS.md` over `docs/swarm/` until those are migrated.

## HermesWorld (separate side-project)

`docs/hermesworld/` (40 files) + `src/screens/playground/` are a **3D agent-MMO game** experiment ("HermesWorld", domain `hermes-world.ai`), distinct from the core Workspace product. It dominates the doc tree by file count but is not part of the Workspace runtime. The most recent memory handoff (`memory/goals/2026-05-05-hermesworld-viral-sprint/handoff.md`) covers a landing-page + character-pipeline sprint that was **local-only/uncommitted on the author's Mac** and is not present in this clone.

## Version state (as of this audit)

`package.json` = **2.3.0** (the truth). README badge, SECURITY.md, and FEATURES-INVENTORY now agree. CHANGELOG reconstructed through Unreleased. Only v2.3.0 was cut via a `chore(release):` commit; no git tags exist.
