---
'nexus-agents': patch
---

refactor(cli-adapters): the stateless `run*Stage` scoring runners and `StageDependencies` now live in `cli-adapters/composite-router-scoring-stages.ts`, leaving `runPipeline` and its gating in `composite-router-stages.ts` — a pure move with no routing behaviour change (#6148).
