---
'nexus-agents': patch
---

`AuditLogger.close()` no longer drops audit events logged while a flush was already running (#6573). When a timer flush was in flight, `close()` waited for that flush and then closed storage, but the flush had taken its batch before the later events arrived. The usual casualty was `system.shutdown.begin`, logged just before shutdown. `close()` now flushes until the queue is empty. If a flush fails during close (for example, the cross-process lock times out), the events it could not write are counted as a persist failure, logged with a `strandedEvents` count, and `close()` rejects. They are never written twice.
