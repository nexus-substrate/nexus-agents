---
'nexus-agents': patch
---

`system-review` now aborts early with a clear "must run from source repo" error when invoked from a directory that doesn't contain `CLAUDE.md` (#2760, #2720 brainstorm item #5).

Pre-fix `system-review` from `/tmp` ran all five phases anyway. Every tracked doc came back `unknown` → mapped to `stale` by `mapFreshnessStatus` → 7× `DOC_STALE_PENALTY` deducted, plus typecheck/lint fail penalties. The user saw `Health Score: 35/100` (looks "warning-ish") and the docs all marked stale "(0 days)" — surface said "your repo is unhealthy," state said "I'm running in the wrong directory." Same shape as the closed #2716 and #2759.

The fix mirrors #2759: a `detectWrongProjectRoot` precondition checked in `systemReviewCommand` before any phase runs. CLAUDE.md is the canonical marker because it's in the repo root but NOT in the npm tarball — so it cleanly distinguishes "source repo" from "anywhere else."

The dispatcher's exit-code plumbing (#2761) propagates `systemReviewCommand`'s return value via `handleSystemReviewCommand` → confirmed `exit: 1` from `/tmp` with this fix; no separate plumbing change needed for this command.

One regression test pins the wrong-CWD message + early-abort behavior. Verified to fail on pre-fix logic.
