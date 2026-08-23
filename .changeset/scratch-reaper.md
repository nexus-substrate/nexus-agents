---
'nexus-agents': patch
---

Reap stale test scratch before each vitest run (#4413)

`vitest.config.ts` now runs a `globalSetup` hook that removes entries older than
24 hours from the suite's scratch root, and logs what it removed.

#4412 moved that scratch off the shared `/tmp` tmpfs, because the tmpfs filled
and the suite failed to _collect_ ~1,100 test files while reporting zero
assertion failures. That fixed the contention but removed the one property the
tmpfs had — it cleared on reboot. On real disk the same leak accumulated
permanently: the root reached 9.7 GB across 1,987 entries before anything
measured it. The sweep is the other half of that trade.

The reaper reports rather than tidies silently. `ReapReport` distinguishes four
outcomes a naive implementation collapses into one cheerful "cleaned up" — root
absent, root empty, swept-but-nothing-stale, and reaped-N — because a reaper
pointed at the wrong directory otherwise looks exactly like a working one. A
rising reap count each run is the leak detector; a silent net would just hide
the next 9.7 GB.

Ties are retained, not reaped, so a clock skew of a millisecond cannot delete a
concurrent run's scratch, and stale symlinks are removed as links rather than
followed.
