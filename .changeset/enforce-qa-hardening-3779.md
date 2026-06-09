---
'nexus-agents': patch
---

test(capability-loop): worktree add/commit failure-cleanup + breaker trip→reset→resume coverage (#3779)

Closes the last non-blocking QA-hardening gap from the #3770 enforce-path review.
Two coverage holes the existing tests left open: (1) `remediation-proposal-pr.ts` — the
`finally` cleanup lives inside the `try` that opens AFTER `addWorktree` resolves, so an
`addWorktree` rejection must NOT call `removeWorktree` (no worktree was created) while a
`commitAll` rejection MUST clean up exactly once with the created worktree path; both are
now asserted with the injected `WorktreeOps` fakes. (2) `improvement-remediation-enforce.ts`
— the breaker round-trip (trip → abort → consensus re-vote `reset()` → resume) is now driven
through the REAL `RemediationCircuitBreaker`, proving a tripped breaker un-trips via `reset()`
and the enforce run resumes; a broken reset would have stranded enforce permanently-off.
