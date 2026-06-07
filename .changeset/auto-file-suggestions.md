---
'nexus-agents': minor
---

feat(cli): safeguarded auto-file helper for suggested tasks (#3382 core)

Adds `autoFileSuggestions()` — files candidate `PipelineTask[]` (from `checkForResearchTriggers` / `checkForCapabilityGapTriggers`) as GitHub issues with hard safeguards: rate limit (default 3/run), dedup against open issues by title, a `machine-suggested` label, sensitive org/gov-ref scrubbing, and fail-closed when the GitHub boundary is unavailable. The `gh` boundary is injectable so the safeguards are fully unit-tested without touching `gh`. This is the safe core of the suggest-only → auto-file move (#3382, Option B); the default-on entry point that invokes it lands as a focused follow-up.
