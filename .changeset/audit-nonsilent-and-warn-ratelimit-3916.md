---
'nexus-agents': patch
---

fix(audit/observability): fail-loud audit persist failures + rate-limit the dropped-cost warn (#3916)

#3915 follow-up. Items 1 and 2 from the #3915 ratification (item 3 — counter
export to the observability surface — is deferred).

**Audit-log non-silent drop (fail-loud).** A silently-dropped audit/tier-transition
event undermines the tamper-evident hash chain (ADR-0017 /
`docs/security/audit-hash-chain-threat-model.md`). The audit log uses
`FileAuditStorage`'s own buffered append (not `JsonlStore`), and a failed flush was
previously swallowed by the flush-timer's `.catch` (a single error log, no counter,
no escalation). `AuditLogger` now treats a persist failure as governance-critical
and FAIL-LOUD: `flush()` records-then-rethrows so an awaiting governance caller
still gets the error, while a shared handler logs prominently at `error` level
(`AUDIT PERSIST FAILURE — audit event NOT durably written`), increments a
process-lifetime counter (`getPersistFailureCount()`), and invokes an optional
`onPersistFailure(error)` escalation hook (new optional ctor / `createAuditLogger`
param). The periodic flush timer routes through the same handler so a failure that
arrives via the timer is counted and surfaced rather than silent. This is stronger
than the best-effort warn used for cost, because audit is governance-of-the-governor.

**Rate-limit the dropped-cost warn.** `recordDecisionCost` previously warned on
every `persisted === false`; an unwritable store (disk full / perms / I/O) would
flood logs per-decision and could degrade the main path — ironically risking the
never-fail invariant. The warn is now rate-limited (first-5 burst, then at most once
per 1000 further drops) while the drop COUNTER still increments on EVERY drop (stays
exact) and the decision still never fails. The emitted warn carries
`suppressedSinceLastWarn` so one line accounts for the suppressed drops;
`getDroppedCostWarnCount()` exposes the emitted-warn count for tests.

Tests: a failed audit persist is surfaced (error-logged + counted + thrown, and the
`onPersistFailure` hook fires) — NOT silent; a successful flush neither counts nor
escalates; 200 consecutive cost drops produce a bounded number of warns (≤ 6, not
one-per-drop) while the drop counter reflects all 200 and the decision still returns.
