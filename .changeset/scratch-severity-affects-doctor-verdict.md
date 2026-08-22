---
'nexus-agents': patch
---

A critically full scratch filesystem now fails `nexus-agents doctor` ([#4488](https://github.com/nexus-substrate/nexus-agents/issues/4488) follow-up).

Found by an adversarial review of the change that added the check.

#4528 made the scratch check measure the right filesystems, and its changeset said the check could no longer be "unable to fail for its own motivating incident". That was true of the printed line and **false of the verdict**. `worstSeverity` shipped and was then called nowhere: `allHealthy` was computed from node version, auth method, MCP readiness and CLI status only, so `doctor` exited **0** with a 100%-full tmpfs — reporting the exact condition it exists to catch while passing.

`allHealthy` now accounts for scratch space, at `critical` only. `warn` still leaves room for the current run, and failing the whole command on it would collapse the two thresholds into one.

The predicate is extracted as `isAllHealthy()` so it is directly testable — the wiring was untestable in place, which is a large part of why the gap survived review.

Also adds the first direct tests for `formatScratchFilesystems`. The multi-line render and the empty-list branch were both unexercised: the existing fixture only ever supplied a single-element array, so a broken separator or an `[object Object]` in real `doctor` output would have shipped unnoticed.
