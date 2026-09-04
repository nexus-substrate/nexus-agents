---
'nexus-agents': patch
---

fix(mcp): shutdownToolMemory now stops the auto-decay timer it left running

`shutdownToolMemory` dropped the shared reference and ended the session, but
never stopped the auto-decay interval. `memory-decay.ts` starts a `setInterval`
at `decayIntervalMs` (default one hour, enabled by default) that was not
`unref`'d, and `stopAutoDecay` had exactly one caller elsewhere. So after
"shutdown" the timer and the manager it closes over stayed resident, and the
event loop stayed held.

**Latent, not live — stated so nobody re-derives it as the cause of an OOM.**
Every server exit path force-exits before the loop would matter:
`cli-server.ts` wires the stdin-lifecycle `onClose` to `process.exit(0)`, and
`SIGINT`/`SIGTERM` reach `process.exit` through `handleShutdown`. Found while
re-measuring #5231 and explicitly ruled out as its cause there (that one is a
~280 MB idle baseline, not a leak).

Worth fixing anyway: the masking is incidental. No `transport.onclose` handler
is registered today, so the graceful-shutdown shape that lets the process end
naturally is one handler away — and a `shutdown` function that leaves its
subsystem running is a false statement in the code.

Two changes, because either alone is insufficient:

- `shutdownToolMemory` calls a new `shutdownDecay()`, so the timer is actually
  cleared.
- The interval is `unref`'d, so it can never be the sole reason a process stays
  alive — the treatment `task-store.ts` and `response-cache.ts` already give
  theirs.

Mutation-tested, each separately: removing the `unref` fails 1 test, removing
the `shutdownDecay()` call fails 1, and making `stopAutoDecay` stop clearing the
interval fails 1. The middle one is the seam — before its test existed, deleting
that call left all 54 other tests green, because dropping a reference and ending
a session is all the previous assertions ever checked.

The unref assertion runs under REAL timers deliberately: vitest's fake timers
stub `unref`, so `hasRef()` would report the wrong thing and the test would pass
against un-unref'd code. The `shutdownToolMemory` test asserts the call rather
than a live timer, because the decay manager is built inside an un-awaited async
backend init that does not complete in that environment — a timer-observing test
would have passed vacuously, which is worse than not testing it. The precondition
is asserted either way rather than assumed.

Closes #5402
