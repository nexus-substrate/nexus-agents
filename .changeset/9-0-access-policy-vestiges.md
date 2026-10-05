---
'nexus-agents': major
---

Remove `ClawGuardViolationEvent` from the security `AuditEvent` union, and remove
`auditLogger` from `ExecuteExpertDeps` and `OrchestrateDeps`. ClawGuard's access-policy
producer was retired in #6302/#6321, so nothing created these events or read these
options. Use PolicyFirewall for tool authorization; durable auditing is configured
through the server's audit logger. Durable audit records written before the removal
keep `action: 'security.clawguard_violation'` and can still be queried by that action.
