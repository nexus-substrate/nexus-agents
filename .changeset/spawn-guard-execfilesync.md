---
'nexus-agents': patch
---

fix(testing): guard every child_process spawn entry point, not a hand-picked subset

The CLI spawn guard wrapped `exec`, `execFile`, `execSync` and `spawn`, and
described that list in-line as "only the entry points this tree uses to reach a
CLI". It was not. `execFileSync` is the second most used spawner in production
(23 call sites), including `detectCliBinary`, which calls
`execFileSync(name, ['--version'])` with a guarded CLI name — so the guard let a
real `opencode` process launch, unblocked and unrecorded.

The wrapped set is now enumerated from the module's spawners
(`exec`, `execFile`, `execSync`, `execFileSync`, `spawn`, `spawnSync`, `fork`).
A subset chosen from current usage silently reopens the hole the next time a
caller reaches for a different entry point.

Adds probes that call each synchronous entry point with a guarded binary and
assert the guard message, so the gap is a test failure rather than a comment.
