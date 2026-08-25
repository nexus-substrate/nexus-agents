---
'nexus-agents': patch
---

pin the "a scope is not a measurement" fix with a test that fails on revert

#4758 removed the #4752 regression where opening a heartbeat scope marked the
session measured, so every scoped expert task over 120s logged a false stall.
Nothing pinned it: restoring the pre-fix `heartbeat-monitor.ts` wholesale left
all 34 tests green, because every touched test calls `heartbeat()` (satisfying
both predicates) and the one zero-heartbeat test never enters a scope.

Adds the missing case — scope opened, no step emitted, clock advanced past the
stalled threshold — which is the only test that goes red on that revert. Also
drops a comment still instructing callers to use `markInstrumented`, removed in
#4758.
