# Hermes Knowledge Bank

A local-first, in-repo knowledge base for the Hermes Workspace project: a distilled
overview, a map of all documentation, and the documentation audit (root cause +
findings + fixes). Built to be read first when onboarding, debugging, or auditing.

## Contents

| File | Read it when… |
|------|---------------|
| [`hermes-overview.md`](./hermes-overview.md) | You need the big picture fast: what Hermes Agent vs Workspace are, install paths, config/env vars, the memory model, and the swarm roster — distilled from the docs + official upstream research. |
| [`documentation-map.md`](./documentation-map.md) | You're looking for *where* something is documented (106 md files, grouped with one-line purposes, with ⚠️ flags on stale docs). |
| [`audit-2026-05-26.md`](./audit-2026-05-26.md) | You want the documentation audit: the **root cause** of the doc defects, findings by severity, what was fixed, and what still needs a human decision. |

## Why this exists

The 2026-05-26 audit found that the documentation drift traces to three mechanical
causes (an incomplete fork→Hermes brand migration, a release process that skips the
version-bearing docs, and a swarm-roster rewrite that left the prose docs behind).
This knowledge bank both **records** that analysis and gives a stable, accurate
entry point that doesn't depend on the drifting secondary docs.

## Sources of truth (when docs disagree, trust these)

- **Version:** `package.json` → `2.3.0`.
- **Swarm roster/routing:** `swarm.yaml` + `AGENTS.md` (NOT `docs/swarm/*`, which is stale).
- **Env vars / config:** `.env.example` + `src/server/`.
- **Docker volumes/images:** `docker-compose.yml`.
- **Brand naming:** `docs/hermes-workspace-naming-contract.md` (repaired 2026-05-26).

## Maintenance

When cutting a release, update in lockstep: `package.json`, `README.md` badge,
`CHANGELOG.md`, `SECURITY.md` supported-versions table, and `FEATURES-INVENTORY.md`
header. That single habit prevents the version-drift class of defects this audit found.
