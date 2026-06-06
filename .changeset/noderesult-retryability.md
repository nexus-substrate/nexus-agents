---
'nexus-agents': patch
---

feat(graph): classify failed NodeResults with errorCategory + isRetryable (selective-retry foundation)

Failed `NodeResult`s now carry an optional `errorCategory` (5-value taxonomy) and
derived `isRetryable` (only `transient` is retry-safe by default). The executor
classifies thrown node errors via `categorizeOutcomeError` → `coarsenFailureCategory`;
node-not-found → internal, post-step verification failure → business (both
non-retryable). Additive/optional — no behavior change for existing consumers.
This is slice 1 of selective-retry (#3534): gives retry logic a safe signal so
only transient failures are re-run. Part of #3531.
