---
'nexus-agents': minor
---

feat(governance): tool-fitness ledger data layer (#3851)

Adds the per-tool fitness ledger data layer that epic #3850 (suggest-tier
pruning pipeline — never autonomous removal) builds on. New module
`src/governance/tool-fitness-ledger.ts` records and aggregates per-tool fitness
signals: `invocationCount`, `lastUsedAt`, success/failure correlation
(`successCount`/`failureCount`/`successRate`), and a `cost` placeholder (full
cost accounting lands with Epic G; `undefined` distinguishes unmeasured from
zero).

Persistence MIRRORS the established durable-telemetry idiom rather than forking
a parallel one: storage is the shared `JsonlStore` primitive
(`config/jsonl-store`, #3762) — the same hydrate-on-construct /
append-on-write / Zod-validate-each-line mechanism behind `PersistentOutcomeStore`
and the `ci-health` event log — bounded by oldest-eviction rotation (#3089
size-cap concern). The path resolves via `nexusDataPath('tool-fitness',
'ledger.jsonl')`; `tool-fitness` is cross-repo (homedir-scoped) because tool
fitness accumulates across the operator's whole workflow.

API: `ToolFitnessLedger.record()` / `statFor()` / `report()` / `size()`, the
`ToolFitnessEventSchema` Zod schema + inferred type, and a lazy
`getToolFitnessLedger()` singleton.

DATA LAYER ONLY. The `tool-fitness` SignalCategory wiring into
`improvement_review` is deferred to #3852 (its first consumer), so this producer
carries the sanctioned `@export-no-consumer-yet — see #3852` marker for the
producer/consumer gate (#3024). No pruning/removal pipeline is included —
removal is never autonomous and requires the Epic D human-ratification path.
