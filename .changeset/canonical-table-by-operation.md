---
'nexus-agents': patch
---

docs(governance): key the canonical-paths table on operations, not symbols

The table listed important symbols, which let it bless both sides of a
duplication without anyone noticing. It named `createAllAdapters()` under "CLI
adapters" AND `UnifiedAdapterRegistry` under "Adapter registry" — two entries
for one question, 7 call sites on one and 8 on the other — while a separate
line said adapter access must go through the registry. It named the pipeline
event bus canonical while `core/event-bus.ts` re-exports the other bus as the
core surface. It named a pricing source but no canonical cost function, which
is how eight cost paths accumulated.

Each row now answers "what do I call to do X", with exactly one answer.

`UNRESOLVED` is introduced as a real value. Where two implementations exist and
choosing between them is a design decision rather than a cleanup, the row says
so and names the tracking issue. A table that silently blesses both sides is
worse than one that admits the fork: an author reading it cannot tell they are
picking a side.

Ratified by the owner. Part of epic #5121.
