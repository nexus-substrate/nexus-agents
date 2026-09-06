---
'nexus-agents': patch
---

Audit security-tier refusals. A tool declared `user-facing` or `external` that
refused a prompt-injection payload returned above both the rate limiter and
`executeAndAudit`, so the refusal wrote nothing to the audit chain — hostile
traffic was the only traffic invisible to it, and an attack read as a quiet
period. `IAuditLogger.logSecurityEvent` had been declared and implemented since
#193 with no production caller; the refusal path is now it. The refusal check
and its record move to `secure-handler-tier.ts` alongside the rate-limit pair,
and the record names the detected patterns and the tier that refused.
