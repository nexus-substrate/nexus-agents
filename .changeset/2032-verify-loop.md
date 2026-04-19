---
'nexus-agents': minor
---

feat(swe-bench): post-patch verification loop utilities (#2032)

Adds pure utilities for classifying patch-verification failures and
deciding whether to retry the agent. Deliberately decoupled from the
evaluation-harness I/O so consumers can unit-test the classifier
without spinning up Docker; integration with `agent-runner.ts` is a
separate follow-up so this first PR stays reviewable.

- New `swe-bench/verify-loop.ts`:
  - `classifyPatchFailure(stderr, stdout)` → `VerifyFailureClassification`
    Recognizes `patch_not_applicable`, `syntax_error`, `timeout`,
    `missing_dependency`, `runtime_error`, `test_failure`; falls
    through to `unknown`.
  - `shouldRetry(category, iteration, maxRetries)` — category-aware
    retry policy. `timeout` never retries; `wrong_file_modified` and
    `unknown` get exactly one retry; everything else is retryable
    up to the cap.
  - `buildRetryHint(classification, iteration, maxRetries)` — terse
    prompt fragment with extracted test names (capped at 5).
  - `buildVerifyOutcome({passed, iteration, stderr, stdout})` — the
    one-call-per-attempt wrapper integration callers will use.
- Default max retries: 2 (configurable per call).
- Reuses the existing `FailureCategory` type from
  `evaluation-failure-types.ts` — no new failure taxonomy.
- 20 tests cover all patterns, retry-cap behavior, hint truncation,
  empty-output safety, and end-to-end outcome construction.

Child of #1574 via #2030.
