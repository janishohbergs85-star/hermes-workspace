# Changelog

All notable changes to Hermes Workspace are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

> Reconstructed from git history (merges dated 2026-05-13 … 2026-05-24, after the v2.3.0 release commit `15fa9cd`). Verify before the next release cut.

### Added
- **Nix packaging** (#480) — flake-based build/install path.
- **Remote access guide + Docker troubleshooting table** (#519).

### Changed
- **`docker compose up` now pulls pre-built images by default** (#82) — `nousresearch/hermes-agent:latest` for the gateway and `ghcr.io/outsourc-e/hermes-workspace:latest` for the UI. Agent state persists in the `hermes-agent-data` named volume. Adds `docker-compose.dev.yml` overlay for building from source.
- **Workspace cron delivery** — preserve multi-target cron delivery and resolve the Hermes CLI path for workspace cron jobs (#508, #509).

### Fixed
- **Streaming** — detect premature connection close and surface the error to the user (#526).
- **Chat** — prevent prompt duplication and response loss after compaction (#525).
- **Conductor** — mobile rendering: double header, missing tab bar, CONDUCT truncation (#521).
- **Profiles** — dashboard API fallback for split-host deployments (#520).

## [2.3.0] — 2026-05-07

> Reconstructed from git history (release commit `15fa9cd chore(release): v2.3.0`; README bump #389). v2.1.0 and v2.2.x were developed but never cut as separate `chore(release)` commits — their work rolled forward into this line. See [docs/release-2.1.0.md](docs/release-2.1.0.md) for the standalone 2.1.0 Swarm notes.

### Added
- **SciFi theme** — full dark/light palette with Tailwind v4 token remaps (#320).
- **Agent Pairing** section in README; dropped MseeP badge (#389).
- **kimi-k2.6 256k context window** support (#357).
- **HermesWorld** asset/brand work — MJ asset wiring (#374), brand asset pack (#367), asset-generation v2 prompts (#370), name reservations public claim flow (#383), playground speech bubbles/toasts (#366), Agora HUD polish (#376).

### Fixed
- **Docker** — start the Hermes Agent gateway in compose (#385).
- **Updates** — show the "Hermes updated" modal only once per release (#386).
- **Chat** — correct local session accounting and titles (#350).
- **Conductor** — sanitize mission goals before spawn (#335).
- **Tasks** — auto-detect backend between hermes-tasks and claude-tasks (#361); unify the Workspace task board with the Hermes Kanban backend (#311, #348).
- **Jobs API** — normalize response shape to always return `{jobs:[]}` even when the gateway returns a bare array (#358, fixes #162).
- **Update checker** — add legacy `claude-workspace`/`claude-agent` remote aliases for back-compat (#359).

## [2.1.0] — 2026-05-05

> See [docs/release-2.1.0.md](docs/release-2.1.0.md) for full notes. Documented at release time but not cut as a tagged/`chore(release)` commit.

### Added
- **Swarm Mode** — built-in multi-agent orchestration: route work from a main Hermes Agent into a live worker swarm, persistent tmux-backed workers, role-aware dispatch and orchestration surfaces.
- **Board, reports, and inbox flow** — Board/Kanban support for swarm work, reports and checkpoint routing, inbox-style handling for blocked and review-ready work.
- **Orchestrator routing** — worker checkpoints route through the orchestrator first; cleaner reviewer/escalation flow.

### Changed
- **Hermes path + environment handling** — canonical Hermes root handling; improved home/env handling for profiles and run storage.

### Fixed
- Long-running SSE chat streams survive silent agent processing windows.
- Approval banner wiring fixed so tool approvals are visible again.
- Local-only portable sessions can be deleted correctly.
- Dashboard fallback added for session create/update/fork flows.

Included PRs: #192, #196, #198, #202, #204, #205, #206, #207, #208, #211, #215.

## [2.0.0] — 2026-04-20

**Zero-fork release.** Clone, don't fork. Hermes Workspace now runs on vanilla `hermes-agent` (installed via Nous's official installer — `curl -fsSL …/install.sh | bash`, or from source) with no patches, no drift, no custom gateway required.

### Added
- **Zero-fork architecture** — dual gateway/dashboard routing; workspace talks directly to vanilla `hermes-agent` 0.10.0+ via standard endpoints (`/v1/models`, `/api/sessions`, `/api/skills`, `/api/config`, `/api/jobs`)
- **One-liner curl installer** — `curl -fsSL … | bash` provisions workspace + gateway + defaults
- **Claude-Nous theme** — dark + light editorial variants with cobalt/paper surface pass, thin 1px architectural borders, editorial type accents
- **Conductor** (`/conductor`) — mission-control surface ported from Clawsuite; spawn missions, assign workers, watch live output and costs
- **Operations** (`/operations`) — agent registry / sessions manager ported from Clawsuite; pause, steer, kill live agents with role and model insight
- **Synthesized tool pills** — inline tool-call rendering from dashboard stream markers when running against zero-fork gateway
- **Landing parity pass** — hero, features, screenshots, setup, OG image, mobile theme toggle
- **Task board status vs. assignee** decoupling
- **Local-model chat session persistence** — local sessions appear in history + session list
- **Memory is local-fs first** — honors `HERMES_HOME`, no gateway dependency
- **Splash + screenshots refresh** — Conductor, Dashboard, Tasks, Jobs captured in new editorial theme

### Changed
- **Model picker** — fetches from gateway (`~/.hermes/models.json` for user-configured models), matches OCPlatform behavior; shows only configured providers instead of all upstream
- **`enhanced-fork` mode label** no longer implies a fork is required; it indicates streaming route availability on vanilla gateway
- **Dashboard + enhanced-chat capabilities** marked optional; missing endpoints no longer trigger warnings
- **Feature-gate + install copy** — all fork-era references purged
- **Theme family allowlist** — `claude-nous` promoted to the enterprise allowlist
- **Session pill** — solid dark-mode background, matches model selector

### Fixed
- Duplicate responses and disappearing history on interrupt (#62)
- Portable-mode double user message, uncleaned timeouts, orphaned unregister callbacks
- Local model selection actually propagates to chat (no silent fallback)
- Strip provider prefix correctly for local routing
- Dashboard token injection on `/` (not `/index.html`)
- Onboarding no longer stacks behind workspace shell
- Root bootstrap guards against uncaught errors
- Preserve assistant text during tool-call streaming
- Installer output uses defined escape vars (removed undefined BOLD/RESET)

### Removed
- All references to the legacy "enhanced fork" as a requirement
- Stale fork-era gateway instructions and feature-gate copy

---

## [1.0.0] — 2026-04-10

Initial public release. Chat, files, memory, skills, terminal, dashboard, settings — the foundational workspace.
