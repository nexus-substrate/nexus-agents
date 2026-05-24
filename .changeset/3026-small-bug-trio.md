---
'nexus-agents': patch
---

**fix:** 3 small isolated bugs surfaced by the deep audit (#3026 findings 3–5).

PR 1 of #3026 — three independent fixes, each < 30 LOC + a regression test, no contract changes.

### Finding 5 — circuit breaker `failureCount` grows monotonically across recoveries

`packages/nexus-agents/src/cli-adapters/circuit-breaker.ts:212-227`. `transitionTo('open',…)` only zeroed failure/success counts when going to `'closed'`. After a `half-open → open → half-open` cycle, `failureCount` carried over — under flaky failure patterns (intermittent rate-limit + recovery), `getSnapshot().failureCount` and `CircuitStateChangeEvent.failureCount` grew without bound across cycles, even though each cycle's failures had already served their threshold purpose. Operator dashboards / alerts triggered on absolute failure count saw misleading inflation. **Fix:** reset `failureCount = 0` on transitions to `'half-open'`.

### Finding 4 — capacity tracker over-counts requests; sliding window vs tumbling reset mismatch

`packages/nexus-agents/src/cli-adapters/capacity-tracker.ts:122-216`. `usageHistory` was slide-pruned (entries older than `now - windowMs` shifted off), but `requestCount` was only reset by the "tumbling" branch (`windowStart < cutoff`), which fires whenever the _earliest_ request is older than `windowMs` — even though more-recent requests are still inside the sliding window. Result: continuous traffic across a window boundary triggered a mass-prune that incorrectly dropped current-window requests, making `remainingRequests === 0` exhaustion fire prematurely (or too late) depending on burst pattern. Upstream routing (`composite-router-helpers.fetchCapacityData`) then re-routed away from a CLI that actually had capacity.

**Fix:** added a parallel `requestTimestamps: number[]` array that is slide-pruned identically to `usageHistory`; `requestCount` is now derived from `.length` after pruning. Dropped the tumbling-reset branch in `pruneOldEntries` — both arrays now use pure sliding-window semantics. `windowStart` is rebased to the earliest remaining entry (used by `resetTime` reporting), falling back to `now` when both arrays are empty.

### Finding 3 — stagger delay compounds with bounded concurrency

`packages/nexus-agents/src/orchestration/aorchestra/worker-dispatcher.ts:485-488`. The stagger delay applied `taskIndex * staggerDelayMs` (absolute index), but `executeWithConcurrencyLimit` only runs `maxConcurrency` workers in parallel — tasks beyond that already wait naturally for a slot to free, then _additionally_ slept `taskIndex * staggerDelayMs`. For a wave of 10 with `maxConcurrency=3` and 500ms stagger, `tasks[9]` slept 4500ms AFTER waiting for `tasks[0-6]` to complete, defeating the rate-limit-burst-prevention goal (by the time `tasks[9]` ran, the API burst window had long since cleared).

**Fix:** modulo by `maxConcurrency` so the stagger applies within each concurrency slot without compounding across them.

### Test coverage

3 new regression tests (1 per finding): failureCount reset across recovery cycles, sliding-window request counting across a boundary, stagger non-compounding with `maxConcurrency=2` + 5-task wave. 150 tests pass across the 3 affected test files (was 147).

### What's left on #3026

PR 2 will tackle findings 1+2 together — the SIGKILL escalation + AbortSignal threading through `ICliAdapter.execute`. That's a contract change touching all 5 concrete adapters + 3 call sites (parallel-exploration, watchdog, consensus-plan); deserves its own focused review.
