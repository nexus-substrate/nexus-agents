---
'nexus-agents': patch
---

**refactor(cli-adapters):** retire the unwired DAAO difficulty estimator (closes #2940).

DAAO (Difficulty-Aware Agent Orchestration, arXiv:2509.11079) was prototyped under Issue #334 and exported from `cli-adapters/index.ts` as `DAAOEstimator` / `createDAAOEstimator` / `estimateDAAODifficulty` / `routeByDAAODifficulty` / `encodeTaskFeatures` plus a full Zod-validated config + 8-dimensional feature surface. But `#334` ended up implemented via `ZeroRouter` — `composite-router.ts` consumes `decision.difficulty` / `decision.tier` from ZeroRouter for fast/balanced/powerful tier selection, and never touches DAAO. The only non-test consumer was `routing-integration.test.ts`, which existed primarily to compare DAAO against ZeroRouter.

Continuing the activation-or-delete YAGNI sweep from #2937, #2938, #2939, #3018.

## Removed

- `packages/nexus-agents/src/cli-adapters/daao-estimator.ts` (387 LOC)
- `packages/nexus-agents/src/cli-adapters/daao-feature-extraction.ts` (386 LOC)
- `packages/nexus-agents/src/cli-adapters/daao-types.ts` (274 LOC)
- `packages/nexus-agents/src/cli-adapters/daao-estimator.test.ts` (819 LOC)
- `packages/nexus-agents/src/cli-adapters/daao-feature-extraction.test.ts` (403 LOC)
- `packages/nexus-agents/src/cli-adapters/routing-integration.test.ts` (1010 LOC) — primarily DAAO-vs-ZeroRouter comparison; ZeroRouter has its own dedicated 700-LOC test file (`zero-router.test.ts`) and CompositeRouter has 938 LOC + 7 additional helper test files, so the routing-integration coverage is preserved elsewhere.
- All DAAO entries from `cli-adapters/index.ts` (5 values + 9 types + 9 schemas/constants).
- DAAO mention in `utils/text-utils.ts` consumers comment.

## Doc updates

- `docs/architecture/ROUTING_SYSTEM.md`: replaced the "DAAO Difficulty Estimator" section with a "Difficulty Estimation" note pointing at ZeroRouter; updated the Source Files table; removed DAAO from the Research Sources table.
- `docs/research/RESEARCH_INDEX.md`: annotated the DAAO row as retired with link to #2940.
- `docs/research/registry/techniques.yaml`: flipped `daao-difficulty-estimation.status` from `implemented` to `retired`, cleared `integration_files`, added a 2026-05-24 retirement decision entry with the ZeroRouter-supersedes rationale.

## Test plan

- [x] `pnpm tsc --noEmit` clean post-deletion.
- [x] `pnpm vitest run src/cli-adapters/composite-router.test.ts src/cli-adapters/zero-router.test.ts` → 125 pass (no regressions from losing routing-integration coverage).
- [x] `pnpm eslint` on the 2 touched files clean.
- [ ] CI: full matrix, governance + registry-coverage gates.

## If DAAO returns

If a true alternate VAE-based estimator with different feature weights becomes a real production need, reintroduce alongside the wiring stage in `composite-router.ts` (or as an explicit alternate stage with a flag) in the same PR. Producer-without-consumer was what the issue called out as contributor confusion.
