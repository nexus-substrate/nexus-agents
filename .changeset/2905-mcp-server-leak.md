---
'nexus-agents': patch
---

**fix(mcp):** harden the stdin-lifecycle monitor so `--mode=server` processes don't leak as zombies. Closes #2905.

The #810 fix used a single signal — `process.stdin.once('end')` — to detect parent death. That misses SIGKILLed parents and abrupt pipe death, where `'end'` never cleanly emits. A process sweep found **134 leaked `nexus-agents --mode=server` processes** aged up to 17 days.

`StdinLifecycleMonitor` now watches three independent signals, firing the shutdown callbacks exactly once whichever arrives first:

1. stdin `'end'` — clean parent exit (unchanged).
2. stdin `'close'` — the stdin fd closed; covers abrupt death `'end'` misses.
3. **ppid change** — polls the parent pid; if it differs from the value captured at `start()`, the original parent died and the process was reparented. This is the catch-all for SIGKILLed parents that the stream events can't see. The poll timer is `unref()`'d so it never keeps the process alive.

The monitor is constructable with `{ getPpid, ppidPollMs }` overrides so the ppid path is unit-testable without real reparenting. 9 tests cover all three signals, fire-once semantics, throwing-callback isolation, and interval cleanup.
