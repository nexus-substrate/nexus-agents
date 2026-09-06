---
'nexus-agents': patch
---

Triangulated review and consensus planning no longer count a CLI whose output did not parse as a successful, "used" CLI: the partition records `success: false` with an `unparseable …` error, it is excluded from `clisUsed` and from a success outcome record, and a literal empty findings array is still a clean review (#5697).
