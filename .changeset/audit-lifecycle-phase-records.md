---
'nexus-agents': minor
---

Audit lifecycle records now state the phase they actually observed. `system.startup` with outcome `success` was written the moment the audit logger was constructed — before authentication, tool registration and transport connect — so a throw in any later step left a durable "startup succeeded" record. Startup now emits `system.startup.begin` at that point and `system.startup` with `success` or `failure` at the real completion point. Shutdown emits `system.shutdown.begin` only: the audit sink is the first thing closed, so a completion record is not writable. `AuditLogger.logSystemShutdown` is deprecated and delegates to `logSystemShutdownBegin`.
