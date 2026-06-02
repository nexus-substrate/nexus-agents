---
'nexus-agents': minor
---

feat(tune): durable audit trail for self-tuning routing demotions (#3323)

Each enforced routing demotion now appends a tamper-evident `tune.demote` record
to the immutable AuditLogger (category `configuration`, queryable via
`verify_audit_chain`), in addition to the structured log. The record carries the
CLI, magnitude, resulting multiplier, reason, provenance, and timestamp. The
audit sink is optional/injectable (omitted in shadow/unit contexts) and wired
from the server through `initV2PipelineSubsystems` → `startTuneStage`. Audit
failures never break the tune path. Satisfies a default-on exit criterion for
the self-tuning loop (#3323): a default-on auto-mutating router must leave an
auditable trail.
