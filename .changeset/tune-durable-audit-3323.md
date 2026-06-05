---
'nexus-agents': minor
---

feat(tune): durable audit for routing-demotion reversals (#3323 criterion 1)

The self-tuning loop's routing mutations are now fully recorded on the immutable
`AuditLogger` chain (verifiable via `verify_audit_chain`): the demotion
(`tune.demote`, shipped in #3325) AND its reversal (`tune.reversal`) when an
adjustment decays/expires (`cause: decay_expiry`) or is superseded by a fresh
demotion (`cause: superseded`). `TuneAdjustmentStore` gains a state-only
`onReversal` hook; `TuneStage` records the audit entry via the existing canonical
audit sink, gated identically to the demotion audit (enforce + audit-sink wired;
shadow mode records nothing). Best-effort/fail-safe at both the store and stage
layers so auditing never throws on the router hot-read path or gates a mutation.

Satisfies exit-criterion 1 (durable audit) of the tune-loop default-on bar
(#3323); the other criteria remain open. No defaults changed.
