---
'nexus-agents': patch
---

fix(mcp): send run_graph_workflow audit events to the durable chain

`run_graph_workflow` built its audit trail with a bare `createAuditTrail()`, so
with `enableAuditTrail: true` the `graph_execution` records went to an
in-memory array capped at 10,000 entries, evicted oldest-first, and discarded on
process exit. They were never hash-chained and never visible to
`verify_audit_chain` — the tool reported an audit trail it was not keeping.

The other three `AuditTrail` construction sites (`execute-expert`,
`orchestrate`, `dev-pipeline`) all thread a durable sink. This one bypassed the
guard that exists to prevent exactly that: `createDurableAuditTrail` returns
`undefined` without a logger specifically so a caller cannot silently receive a
non-durable trail.

`buildStandardDeps` has passed `auditLogger` to every `standardHandler` tool
since #4991, so no registration change was needed — the tool discarded it purely
because its deps interface never declared the field. When no logger is
configured the run still proceeds, but now warns rather than reporting a
trail it is not recording.
