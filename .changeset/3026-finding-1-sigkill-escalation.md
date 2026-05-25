---
'nexus-agents': patch
---

**fix(subprocess):** SIGKILL escalation when child ignores SIGTERM on timeout (closes #3026 finding 1).

The subprocess timeout path fired SIGTERM and resolved the parent promise immediately so callers don't wait on a hung child. But if the child ignored SIGTERM — Node CLIs that install graceful-shutdown handlers can hang on a broken stream, or spawn subprocesses of their own that keep stdio open — the `'close'` event never fired and the process accumulated as a zombie. Under sustained timeout pressure (long consensus votes with rate-limited backends), zombie Node CLI processes pile up holding file descriptors, API session tokens, and PIDs — eventually exhausting OS limits in ways operators can't trace back to nexus-agents.

The fix:

- Added `SIGKILL_GRACE_MS = 5_000` constant. Five seconds gives well-behaved children time to flush state and exit cleanly while bounding zombie-process accumulation when the child ignores SIGTERM.
- Extracted a `scheduleTimeoutWithSigkillEscalation` helper from `setupChildProcessHandlers` (the latter was at the 50-line cap). The escalation timer fires after the grace window, checks `child.exitCode === null && child.signalCode === null` (still running), and force-reaps with `child.kill('SIGKILL')`. Logs a warn before escalating so operators can correlate the resource cleanup.
- The escalation timer is `.unref()`'d so it doesn't keep the Node event loop alive — process shutdown wins over the escalation wait.
- Both the primary timeout and the escalation timer are cleared from the `'close'` handler, so a child that exits within the grace window doesn't see the second signal.

2 regression tests in `subprocess-adapter.test.ts`:

- SIGKILL fires after the grace window when child ignores SIGTERM (`exitCode` and `signalCode` both stay `null`).
- SIGKILL does NOT fire when the child exits cleanly within the grace window (`exitCode = 143` set on close).

39 tests pass (was 37); `tsc + eslint` clean.

#3026 finding 2 (AbortSignal threading through `ICliAdapter.execute` so race-loser subprocesses get cancelled cleanly) is the larger half of PR 2 — still pending, will land separately as a contract change touching all 5 concrete adapters + 3 call sites.
