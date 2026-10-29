---
'nexus-agents': minor
---

Enforce the shared graph deadline across preconditions, node handlers, and verification hooks. Timed-out hooks now abort cooperatively, report failure, and remain observed until actual settlement.
