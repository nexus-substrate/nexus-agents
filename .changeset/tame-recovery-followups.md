---
'nexus-agents': patch
---

fix(resilience): RecoverableExpert follow-ups (#4293)

Four calibration/correctness fixes to the opt-in expert execution recovery policy:

- **Archetype threshold calibration.** `RecoverableExpert`'s detector now runs at a local `confidenceThreshold` of 0.4 (not the global 0.6 default) so the behavioral-archetype guidance path can actually fire on error-text-only input, which yields at most one indicator family per regex hit. 0.4 requires two independent families — the strongest evidence this input shape can produce — so the false-positive floor holds: a one-family signal (a 401 "Invalid API key", or a bare `failed to parse tool output`) stays permanent, while a two-family wrapped parse failure fires `fragile_execution`. The global `DEFAULT_DETECTOR_CONFIG` (0.6) is unchanged; an explicit caller `detectorConfig` override still wins.
- **Exhaustion classification.** The exhausted-retry trace now re-classifies the actual `lastError` instead of reusing the stale per-attempt classification (`withRetry` skips `isRetryable` on the final attempt), fixing mislabeled `context.recovery` — including `maxRetries:0` transient failures previously reported as `permanent`.
- **Default max retries.** An empty/partial policy that omits `maxRetries` now defaults to 1 (2 attempts), not `DEFAULT_RETRY_CONFIG`'s 3 (4 attempts). In-tree callers pass `maxRetries: 1` explicitly and are unaffected; external partial-policy callers change from 4 attempts to 2.
- **Cause-depth constant.** Extracted the cause-chain walk depth limit to a named `MAX_CAUSE_DEPTH` constant.
