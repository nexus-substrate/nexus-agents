---
'nexus-agents': patch
---

fix(audit): pr_review governance record no longer silently fails to persist when cwd has no `.git` ancestor (#4278)

`resolvePrReviewRecordsPath()` only resolved the ledger path from `NEXUS_PR_REVIEW_RECORDS_PATH` or `findRepoRoot(process.cwd())`. In an MCP server process the cwd often has no `.git` ancestor, so `findRepoRoot` returned `null` and the pr-review governance record silently failed to persist ("records path unresolved"), with no way for the caller to say where the repo is.

`pr_review` now accepts an optional `repoPath` input (absolute path to the repo root) that is threaded through `persistReviewRecord` → `persistPrReviewRecord` → `resolvePrReviewRecordsPath` as a `repoPathOverride`. Precedence is unchanged and additive: `NEXUS_PR_REVIEW_RECORDS_PATH` env var still wins over everything, `repoPath`/`repoPathOverride` is used next when cwd auto-detection would otherwise fail, and `findRepoRoot(process.cwd())` remains the final fallback — existing callers that pass neither see byte-identical behavior.
