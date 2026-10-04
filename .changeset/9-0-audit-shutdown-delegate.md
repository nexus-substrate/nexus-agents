---
'nexus-agents': major
---

Remove the deprecated shutdown delegate from `AuditLogger`. Replace calls to that delegate with `logger.logSystemShutdownBegin(metadata)`; the metadata argument remains optional. The replacement writes the same `system.shutdown.begin` record. The audit record format and hash chain are unchanged.
