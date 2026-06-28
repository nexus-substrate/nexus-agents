---
'nexus-agents': minor
---

Persist ClawGuard AUDIT-mode violations to the durable audit sink (#4097, epic #4094,
unblocks #2077). Previously, audit-mode access-policy violations were only logged
ephemerally (`logger.warn`), so no false-positive rate was computable for the
audit→enforce graduation decision. They are now ALSO mirrored to the shared,
hash-chained durable store as a new canonical `clawguard_violation` audit event
(queryable by `action: 'security.clawguard_violation'`).

Safe by construction: the persist is best-effort and synchronous off the log-and-allow
path — it never awaits, never throws (a sink failure is swallowed), and never alters the
allow/deny decision (enforce-mode violations are blocked before this point, so wiring
here cannot change enforcement). Only sanitized fields are stored (toolName, warning
[capped], policySource, mode, requestId) — raw tool args are dropped. The durable trail
is established via AsyncLocalStorage at the `withAccessPolicy` boundary in the orchestrate
and execute_expert tools, ONLY when the server threaded an audit logger; the no-logger /
pure-CLI path establishes no trail and stays byte-identical.

Follow-up #4104 builds the false-positive-rate scorer + labeled corpus over the persisted
violations.
