---
'nexus-agents': patch
---

fix(adapters): stop retrying a durable credential cap as if it were a throttle (#5359)

`RATE_LIMIT_PATTERNS` put `key limit`, `quota exceeded` and `usage limit` in one
list with `429`, `throttl` and `requests per minute`. A throttle clears in
seconds; an exhausted credential clears when a human raises the ceiling.
Treating them alike meant retrying against a condition that cannot change.

Observed live across **four consecutive 7-voter panels**: an upstream gateway
key over its total limit burned three ~9-second retries per vote, all failing
identically. The waste was not local — `computeOverallConsensusDeadlineMs`
budgets `timeoutMs * (maxRetries + 1)` as a **shared** wall-clock deadline, so
it starved `scope_steward`, a healthy voter on a different adapter, which died
with `overall consensus deadline exceeded` three runs running. **One dead
credential cost two voices**, on a panel where supermajority is 5 of 7.

The list is split rather than reclassified: `RATE_LIMIT_PATTERNS` stays as the
union so every existing call site keeps its meaning, and the two consumers that
need the distinction ask for it.

- **Retry** (`cli/voter-execution.ts`) abandons the remaining attempts on a
  durable cap, handing the budget to the #3587 fallback — which is what actually
  recovers the voice.
- **Circuit breaker** (`adapters/resilient-adapter.ts`) now counts a durable cap
  as a failure. This is the more consequential half: the rate-limit exemption is
  correct for a throttle, but excluding a cap meant the breaker never opened, so
  every subsequent call paid the same futile retries against the same dead key.

`usage limit` is the least certain of the three — some providers use it for a
rolling window that does clear. Grouped as durable because the observed failures
were spend caps; the changeset says so rather than leaving it implicit.

Mutation-tested in both directions, since over-classifying is the mirror-image
defect: removing the fast-fail fails 1 test, and moving `rate limit` into the
durable list fails 5.
