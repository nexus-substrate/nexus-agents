---
'nexus-agents': minor
---

feat(capability-loop): code-PR enable-readiness gate + dry-run worktree orchestrator (Stage 2, OFF — no push) (#3670)

Stage 2 of closing the capability loop, OFF-by-default with no runtime consumer.
Composes the hardened Stage-1 guards (`codepr-guards.ts`); reimplements no guard
logic.

- `codepr-enable-readiness.ts` — `evaluateCodePrEnableReadiness`, a pure,
  deterministic DOUBLE-GATE mirroring `evaluateEnforceReadiness`. Returns
  `ready: true` only when ALL hold: the OFF→on flag is set, a recorded
  enable-vote ref is present, a guards-green soak threshold is met (N consecutive
  dry-run plans with zero guard denials), and a named owner has acknowledged. The
  raw flag ALONE can never activate the push path. Stage 3 (the push) must call
  this and refuse unless `ready`.
- `codepr-orchestrator.ts` — `planCodePrRun`, a dry-run orchestrator that applies
  a proposed change set in an ISOLATED throwaway git worktree, composes
  `confinePath`/`classifyPath`/`evaluateWriteGuards`, records the audit on both
  the pass and abort paths, and returns a planned PR descriptor (what it WOULD
  push). It performs NO push, NO PR-open, and NO live-tree write, and atomically
  discards the worktree in a `finally` even on failure/throw. Fail-closed: a
  sensitive path, path escape, secret, over-budget change set, or any throw
  returns a denied plan (never thrown), with no partial application.

No MCP tool / CLI command / workflow added (repo-index unaffected). Stage 3 (the
scoped-token push behind the enable-vote) is still pending.
