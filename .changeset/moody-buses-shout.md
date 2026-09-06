---
'nexus-agents': patch
---

memory: a row with corrupt metadata is reported unreadable instead of being given a fabricated `MEDIUM` importance (#5835)

`memoryRowToEntry` used to swallow a `JSON.parse` failure and substitute `{ importance: 'medium' }`. A memory stored as `HIGH` then failed a `HIGH` importance filter, and nothing in the record said why. A second edge went unguarded entirely: well-formed JSON of the wrong shape (`null`, `[]`, an unknown `importance`) was cast through with `as`, and the `TypeError` surfaced later, far from the corrupt row.

Metadata is now validated against `MemoryMetadataSchema` — the same schema `store()` already enforces on write — and a failure is returned rather than papered over:

- `memoryRowToEntry` returns `Result<MemoryEntry, UnreadableMemoryRow>`, naming the key, the reason (`metadata_not_json` / `metadata_wrong_shape`) and the parser detail.
- `getMemoryEntry` returns `Result<MemoryEntry, MemoryLookupFailure>`, separating `not_found` from `unreadable` — the two states the old `undefined` conflated.
- `scoreAndSortEntries` returns `{ entries, unreadable }` so `retrieveByPriority` logs the skip count; `searchWithAttributes` and `findMatchingMemories` log the skipped keys; `getPriorityScore` and `retrieveWithAttributes` return a `MemoryError` naming the key.

Validation is `loose`, so unknown metadata keys (A-MEM attributes under `metadata.amem`) survive: a strict parse would have traded the fabricated importance for silently stripped attributes.

Remedy chosen by a live 7-voter panel (6/7, option D).
