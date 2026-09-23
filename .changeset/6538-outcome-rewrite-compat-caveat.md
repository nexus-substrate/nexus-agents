---
'nexus-agents': patch
---

`PersistentOutcomeStore` keeps fields it does not recognise when it rewrites `outcomes.jsonl` on hydrate (the #6538 fix). This holds for reclassified rows as well as rows that survive a purge, and a store that needs no purge or reclassification is not rewritten at all. New tests pin all three behaviours.

Caveat: versions released before the #6538 fix still strip unknown fields whenever their hydrate rewrites the file. If any process sharing a data directory runs one of those versions, it can still delete fields such as `routedBy`, and they cannot be recovered. Preservation only holds once every process that reads the same data directory is on this version or later.
