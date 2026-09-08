---
'nexus-agents': patch
---

`routerTypeMeasured` is now persisted on the SQLite `routing_decisions` row
(#5915, closing the third step of #5812). Until now the signal existed only in
in-memory analytics that do not survive a restart, so any offline read of the
store still saw the inflated TOPSIS count the live stats had been fixed to
report honestly. Adds a `PRAGMA table_info`-guarded `ALTER TABLE` so existing
databases get the column; a NULL, a 0 and an absent column all read as
UNMEASURED.
