---
'nexus-agents': patch
---

Add `outputSchema` to `memory_query` + `memory_stats` + `memory_write` MCP tools (#2340 batch 2).

Continues #2340. Each handler switched from `toolSuccess(JSON.stringify(...))` to `toolSuccessStructured(...)` so the SDK validates `structuredContent` against the schema. Concrete schemas modeled from each handler's actual return shape:

- `memory_query` — `{ query, expandedQuery?, results: unknown[], count, source }`
- `memory_stats` — `{ backends: { session, belief, typed, mobimem, decay (booleans) }, session, belief, typed (nullable), mobimem (nullable), decay, collectedAt }`
- `memory_write` — `{ success, backend, key, deduplicated?, error? }`
