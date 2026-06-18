---
'nexus-agents': patch
---

docs: expand the generated TypeDoc API reference (`/api/`) from the single `src/core/result.ts` entry point to the full curated public surface — the 19 non-test barrels under `src/exports/` (core, config, adapters, agents, agents-skills, agents-ictm, workflows, mcp, cli-adapters, context, learning, audit, security, consensus, observability, orchestration, benchmarks, pipeline, scm). The website renders the committed `docs/api/` markdown via the existing `/api/[...slug]` route (no prebuild re-added). Generation stays decoupled via `pnpm -C packages/nexus-agents docs:api:md`.
