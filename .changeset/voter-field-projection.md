---
'nexus-agents': patch
---

fix(audit): one canonical voter-field order for the vote-record hash (#6057)

The per-voter hash projection listed each `VoterSummary` field by hand, so a field added to the schema and the builder but not to the projection was silently unhashed (`retried` was, until #6050). The projection now walks a single module-private tuple whose exhaustiveness is checked at compile time in both directions (`satisfies` + `Exclude<keyof VoterSummary, …> extends never`), and a builder test pins that a maximal seat carries every schema key. Byte-identical for every existing record: the order is the one the projection already used, and absent optionals are still omitted, never emitted as `null`.
