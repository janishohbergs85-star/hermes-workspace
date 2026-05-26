# Documentation Map

> Every markdown doc in the repo, grouped, with a one-line purpose. 106 files total. Generated 2026-05-26. Use this as the index when looking for "where is X documented".

## Root (7)
| File | Purpose |
|------|---------|
| `README.md` | Main product doc: features, quick-start (Docker / one-liner / attach), remote access, troubleshooting. **Actively maintained, largely accurate.** |
| `AGENTS.md` | Swarm agent contract — the canonical semantic roster + operating rules. |
| `CHANGELOG.md` | Release history (reconstructed through Unreleased in this pass). |
| `CONTRIBUTING.md` | Dev setup, env vars, PR guidelines. |
| `SECURITY.md` | Security policy, measures, supported versions. |
| `FEATURES-INVENTORY.md` | Exhaustive feature catalog (30 KB). |
| `FUTURE-FEATURES.md` | Post-roadmap ideas. |

## docs/ — core product (22)
| File | Purpose |
|------|---------|
| `docs/AGENT-PAIRING.md` | Step-by-step agent↔gateway pairing guide (audience: setup agents). |
| `docs/troubleshooting.md` | Common failure modes + fixes. |
| `docs/docker.md` | Docker deployment deep-dive + troubleshooting table. |
| `docs/multi-gateway-pool-spec.md` | Multi-gateway pool architecture. |
| `docs/claude-openai-compat-spec.md` | OpenAI-compat architecture spec (filename is legacy; content is Hermes). |
| `docs/workspace-chat-session-routing.md` | How chat sessions route across workspace/gateway. |
| `docs/desktop-update-system.md` | Electron desktop update flow. |
| `docs/tool-artifacts-context-plan.md` | Tool-output artifacts / context-bloat plan. |
| `docs/agent-authored-ui-state.md` | Agent-authored UI state notes. |
| `docs/conductor-bug-log.md` | Conductor bug log. |
| `docs/release-2.1.0.md` | 2.1.0 (Swarm) release notes (rebranded to Hermes in this pass). |
| `docs/i18n-contributing.md` | UI translation contribution guide. |
| `docs/mobile-perf-report.md` | Mobile performance baseline (HermesWorld). |
| `docs/hermes-workspace-naming-contract.md` | Brand naming rules (repaired in this pass). |
| `docs/swarm2-*.md` (5) | Forward-looking Swarm2 specs: agent-IDE, autopilot orchestration, FrankenGPU control plane, memory framework, worker lifecycle + compaction. |
| `docs/design/dirsize-tool.md`, `docs/requirements/dirsize-tool.md` | Dirsize tool design/requirements (Chinese). |
| `docs/playground/README.md` | Playground (HermesWorld engine) overview. |

## docs/swarm/ — Swarm prose docs (6) ⚠️ stale roster
| File | Purpose |
|------|---------|
| `docs/swarm/README.md` | Swarm Mode intro. |
| `docs/swarm/QUICKSTART.md` | Getting started (⚠️ dispatches to non-existent `swarm7`). |
| `docs/swarm/ARCHITECTURE.md` | Swarm architecture (⚠️ describes `swarm1–swarm12`). |
| `docs/swarm/ROLES.md` | Role presets (⚠️ Sage/Scribe/Foundation/… not in `swarm.yaml`). |
| `docs/swarm/SKILLS.md` | Swarm skills (⚠️ lists skills that don't exist; `~/.ocplatform` path). |
| `docs/swarm/AUTORESEARCH.md` | Autoresearch mode operating contract. |

> ⚠️ This cluster is out of date vs `swarm.yaml` + `AGENTS.md` (audit H3/H4). Trust the source-of-truth files until migrated.

## agents/ (10) — one README per semantic worker
`builder`, `reviewer`, `qa`, `researcher`, `orchestrator`, `km-agent`, `ops-watch`, `maintainer`, `strategist`, `inbox-triage`. Each is a short role card matching `swarm.yaml`.

## docs/hermesworld/ — game side-project (40)
Bibles, lore (`lore/`), player guides (`guides/`), quest walkthroughs (`walkthroughs/`), asset-generation specs/prompts, roadmaps. Separate from the core Workspace product; dominates the tree by file count. Key entry: `docs/hermesworld/MASTER-PLAN.md` and `docs/hermesworld/README.md`.

## memory/ (15) — agent working memory (local-first)
- `memory/2026-05-04.md`, `2026-05-05.md` — dated daily notes.
- `memory/goals/2026-05-03-playground-training-grounds/` — a goal with `iterations/001–009` (009 is a strong root-cause post-mortem of the 3002 loading loop) + ship checklist + demo script.
- `memory/goals/2026-05-05-hermesworld-viral-sprint/handoff.md` — landing/graphics sprint handoff (local-only on author's Mac, not in this clone).
- `memory/swarm/missions/2026-05-05-pr-triage.md` — a swarm mission record.

## docs/knowledge-bank/ (this directory)
| File | Purpose |
|------|---------|
| `README.md` | Index + how to use the knowledge bank. |
| `hermes-overview.md` | Distilled overview of Hermes + official-source research. |
| `documentation-map.md` | This file. |
| `audit-2026-05-26.md` | Documentation audit: root cause, findings, fixes, open items. |

## Other (5)
`playground-ws-worker/README.md` (Cloudflare multiplayer hub), `public/assets/hermesworld/**` asset manifests/status, `public/avatars-3d/README.md`, `skills/workspace-dispatch/SKILL.md` (the only bundled skill).
