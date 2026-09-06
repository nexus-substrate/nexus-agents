---
'nexus-agents': minor
---

`GapLedgerLoadReport` can now say what it could not read. Its docstring claimed
"an unreadable file yields zero entries with `fileExisted` true, so 'cannot
read' stays distinguishable from 'nothing there'" — but an existing-but-empty
file produced the identical tuple, so the two were not distinguishable at all.
`readFailed` reports the case, which matters because
`checkForCapabilityGapTriggers` filters `summarize()` by occurrence count: an
unreadable ledger silenced the self-directed research backlog for the one reason
it must not, the measurement failing rather than the demand being absent.
`cappedEntries` reports the entries the 5000-entry cap dropped, which `loaded`
counted as never having existed (#5785).
