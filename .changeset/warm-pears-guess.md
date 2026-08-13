---
'nexus-agents': patch
---

Rename the observability session aggregate to `SessionTokenTotals` (#4440)

`agents/observability` defined a `TokenUsage` interface that models a **running session total**, sharing a name and a shape with the per-call `TokenUsage` in `core/types/model.ts`. The clash was already known — `exports/observability.ts` aliased it as `ObserverTokenUsage` with the comment _"Renamed: core.ts exports TokenUsage"_ — but the workaround lived at the export boundary while the confusing name stayed at the source.

That is not harmless: it led me to file #4439 claiming three duplicate per-call usage types, when there were two and the third was this session aggregate. Conflating them would have been strictly worse than leaving them alone.

Internal name is now `SessionTokenTotals`. The public export keeps the name `ObserverTokenUsage`, so this is not a breaking change.
