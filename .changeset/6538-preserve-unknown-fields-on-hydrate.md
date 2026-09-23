---
'nexus-agents': patch
---

`PersistentOutcomeStore` now hydrates outcomes using `TaskOutcomeSchema.loose()`, preserving unknown forward-compatible fields across hydration and rewrite cycles rather than stripping them.
