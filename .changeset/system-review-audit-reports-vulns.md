---
'nexus-agents': patch
---

stop system-review reporting "No vulnerabilities found" when the audit did not run

`pnpm audit --json` exits **1 when it finds vulnerabilities**, while still
writing the full JSON report to stdout. `safeExec` returns `null` on a non-zero
exit, so the detection path and the failure path were the same path: the report
was discarded, the counts fell back to zero, and Phase 4 printed a pass.

Two changes:

- `safeExecSandboxed` gains `allowNonZeroExit`, which returns the child's stdout
  when it exited non-zero but still produced output. A command that produced
  nothing at all still yields `null` — "ran and reported something" and "could
  not run" have to stay distinguishable. `runPhase4` opts in.
- When the audit genuinely cannot run, `parseError` was already set correctly
  and already surfaced in the action items, but the three places a reader forms
  a judgement all ignored it. The phase verdict now prints `Unmeasured`, the
  health score takes `SECURITY_UNMEASURED_PENALTY` instead of no penalty at all,
  and the filed issue body carries the caveat above the zeroes.

Fixes #4838.
