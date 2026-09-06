---
'nexus-agents': patch
---

`ACTION_CLASSES` derives from `AUTHORITY_TIERS` instead of restating it, so the ordering the authority guard refuses on cannot drift from the manifest's; the uncalled `loadLoopTierRegistry` is removed (#5711).
