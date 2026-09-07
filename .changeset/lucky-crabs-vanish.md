---
'nexus-agents': patch
---

Delete the E2E `ValidationHarness`, whose 20 "checks" were `passed: true`
literals aggregating to `allPassed: summary.failed === 0` — a system-integrity
verdict no code path could make red. It was unpublished (absent from the single
`.` export and from `api-surface.txt`) and had no consumer, internal or external.
Acceptance criteria for a real replacement, including all 20 behaviours it
claimed to validate, are recorded in #5904.
