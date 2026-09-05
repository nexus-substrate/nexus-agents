---
'nexus-agents': patch
---

Self-eval outcomes persist the measured per-component evaluation time instead of `durationMs: 0`, so defect recommendations are no longer purged as skipped workers on the next outcome-store hydrate (#5653).
