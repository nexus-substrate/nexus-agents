---
'nexus-agents': patch
---

**fix(audit):** flush storage on every timer tick and bound the in-memory queue. Closes #2979.

Two coupled bugs in `AuditLogger`/`FileAuditStorage` could indefinitely buffer audit events in memory under sustained load, with disk only catching up at shutdown:

1. The flush timer called `flushQueue()` — which drained the in-memory `eventQueue` into `storage.write()` — but never called `storage.flush()`. `FileAuditStorage.write()` only appends to its `writeBuffer` (no disk I/O), so events accumulated until `close()`. As a side-effect, `currentFileSize` was incremented optimistically, triggering phantom rotation that abandoned un-pushed buffer contents.
2. `flushQueue()` ran serially via `await` in a for-loop, and the interval kept firing while a flush was already in flight. Overlapping flushes plus no cap on `eventQueue` length meant unbounded memory growth under backpressure.

Fix:

- `audit-logger.ts:startFlushTimer` now calls `this.flush()` (which drains the queue **and** flushes storage) instead of `this.flushQueue()`.
- `flush()` coalesces concurrent callers into a single in-flight promise via `inFlightFlush` — overlapping timer ticks or callers wait on the existing drain instead of spawning a parallel one.
- `log()` enforces a new `maxQueueDepth` config (default `10_000`) with a drop-oldest policy when the cap is exceeded; a `warn` log fires the first time the cap is hit and once per `1_000` further drops to avoid log spam.
- `audit-types.ts:AuditLogConfigSchema` adds `maxQueueDepth: z.number().positive().optional().default(10_000)`.
- `cli-server-audit.ts` passes the default explicitly when wiring the production audit logger.
- New tests cover all three behaviors: timer-tick storage flush (regression for bug 1), concurrent-flush coalescing, and drop-oldest backpressure.

Behavior change: existing callers that don't set `maxQueueDepth` get the `10_000`-event cap automatically. Disk writes now happen on every flush interval (default 1s) instead of only at shutdown.
