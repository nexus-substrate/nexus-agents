---
'nexus-agents': minor
---

feat(security): durable audit bridge — mirror security decisions to the hash-chained log (#3291)

Phase 1 of AuditLogger convergence (epic #3288 item 3). The security `AuditTrail`
was in-memory-only, so trust/policy/reputation/sanitization decisions were lost on
exit. Adds `security/audit-bridge.ts` mapping each security `AuditEvent` into the
durable `AuditEventInput` schema (`action: security.*`, `source` via category) and
a `createDurableAuditSink(auditLogger)`. `AuditTrail` gains an optional durable
sink (default-off — zero behavior change); `FirewallConfig.auditLogger` opts a
firewall into durable mirroring. Per the #3291 vote (fold-in over a separate
SecurityAuditLogger). Phase 2 threads the logger from server init + retires
`AuditTrail.append`.
