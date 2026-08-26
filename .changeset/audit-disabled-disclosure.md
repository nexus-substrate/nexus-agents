---
'nexus-agents': patch
---

fix(security): say at startup when no audit chain is being written

Audit was the only security control missing from the `Security configuration`
startup line, and `initializeAuditLogger` announced its absence at `debug` —
dropped at the default `info` level. So the tamper-evident chain the docs lead
with could be off while the startup log confirmed policy mode, auth, rate
limiting and allowed paths and said nothing about this one, which reads as fine
rather than absent. Both audit directories in a long-running checkout were
empty, and nothing had ever said why.

The line now carries `auditEnabled`, and a disabled chain warns — the same
treatment authentication already gets, for the same reason.

Whether off-by-default is the right default is a separate question (#4990);
this only makes the current state legible.
