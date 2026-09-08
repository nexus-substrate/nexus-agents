---
'nexus-agents': patch
---

`nexus-memory` telemetry now records operations that FAILED (#5965).
`recordMemoryEvent` was called only after the work succeeded, so a thrown
validation error, SQLite constraint or closed-backend call produced no event
and no counter row — a domain rejecting 100% of its writes was
indistinguishable from an idle one, while `types.ts` said "emitted on every
backend operation" and `telemetry.ts` said "Updates counters always".

`MemoryEventCounters.count` is now ATTEMPTS (it counted successes), with a new
`errorCount` for the failing subset; `MemoryEvent` carries `error` — the
message only, never the value that failed validation. Both backends' five
operations run through `recordFailedMemoryOp`, which emits before re-throwing,
so caller error handling is unchanged.
