---
---

fix(docs): correct two JSDoc inaccuracies in PipelineRunner — JSDoc audit Phase 2 pilot

Fixes `PipelineExecuteOptions.runsDir` (documented default was `getNexusDataDir()/runs`,
the exact pre-#2889 bug; actual default is `getDefaultRunsDir()` = `nexusDataPath('runs')`)
and `retryFailed` (doc claimed "re-executes only the failed/skipped steps" but the code
re-runs the full pipeline with continueOnFailure — the inline comment confirms it).
JSDoc-only, no behavior change. Epic #3516 / #3519.
