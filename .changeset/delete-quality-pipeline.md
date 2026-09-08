---
'nexus-agents': patch
---

Removes `pipeline/quality-pipeline.ts` (#5771 item 2). `runQualityPipeline` had
no production caller since it was added, and its docstring claimed the workflow
`dev-pipeline.ts` actually runs — a second orchestrator for one concern. It was
barrel-exported but never in the published surface (`pnpm api:check` reports the
surface unchanged), so this is not a breaking change.
