---
'nexus-agents': patch
---

Delete dead `src/workflows/self-development/` engine (PR 1 of epic #2402).

The engine (~7,700 LOC source + tests) was authored before our observability primitives existed (`OutcomeStore`, `weather_report`, `LinUCB`, `fitness-audit`). By the time those landed, no consumer had wired up to invoke its runner — `package.json`, `.github/workflows/`, and CLI dispatch all bypass it. Six months of unwired existence + an in-place replacement (the `improvement_review` MCP tool from PR 2 of #2402, plus the manual `dogfooding-issues` skill) make this a clean Tier-A internal-only removal per `deprecation-and-migration`.

Removed:

- `src/workflows/self-development/` (58 files: engine, phases, audit-trail, github-client shim, git-client, docker-sandbox, notifications incl. `WebhookNotificationHandler`, etc.)
- `scripts/run-self-dev.ts` runner
- `workflows/templates/self-development.yaml`
- `docs/archive/workflows/self-dev-{phases,execution,operations,validation}.md`

Updated:

- `docs/workflows/SELF_DEVELOPMENT_WORKFLOW.md` rewritten as a historical pointer to epic #2402
- Stale comments cleaned in `src/scm/{github-provider,index}.ts`, `src/exports/scm.ts`, `src/cli-adapters/cli-to-model-adapter.ts`, `src/security/sandbox/default-policies.ts`, `docs/architecture/UNTRUSTED_INPUT_HARDENING.md`

Public API: unchanged (the module had zero `src/exports/*` reach).

Verified locally: `pnpm typecheck` clean, `pnpm lint` clean, `pnpm vitest run`: 25,811 pass / 16 skipped (was 26,386 — 575 tests deleted along with the dead engine).
