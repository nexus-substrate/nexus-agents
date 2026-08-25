---
'nexus-agents': patch
---

report how much of the audit log verify_audit_chain could not read

`loadAuditEvents` dropped unreadable files and unparseable/schema-invalid lines
with nothing but a `logger.warn`, and the response carried only `eventCount` —
the number of events that _parsed_, not the size of the log. A verdict computed
over 60 of 100 lines was reported identically to one computed over all 100.

Counts the skips and surfaces them as `skippedLines` / `unreadableFiles`,
omitted when zero so absence means full coverage rather than "unreported".
Resilient reading stays the policy; the caller is now told what it cost.

Fixes #4787.
