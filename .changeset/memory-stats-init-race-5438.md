---
'nexus-agents': patch
---

Wait for in-flight memory-backend initialization before reporting a backend absent (#5438).

The SQLite-backed memory backends start non-blocking at session start, and three read paths checked their availability without awaiting that. For a window after startup, `false` meant "still opening" while being indistinguishable from "failed" or "`node:sqlite` missing".

Reproduced live against a running MCP server: two identical `memory_stats` calls 55 seconds apart returned `agentic/adaptive/typed/mobimem/decay` all `false`, then all `true` with the agentic backend holding 519 entries it had had all along.

- `memory_stats` reported five of seven backends unavailable while `nexus-agents verify` and `doctor` simultaneously reported "memory backends available" — two instruments disagreeing with nothing to reconcile them.
- `memory_query` listed `agentic`/`adaptive`/`typed` as `unavailable`, defeating the exact "searched and found nothing" vs "not searched" distinction that reporting was added to make.
- `memory_write` was worst: it **refused the write** and told the caller `"Agentic memory backend unavailable (requires SQLite)"` — naming a cause that was not the cause.

`reinitializeSqliteBackends()` has awaited this since #794. The fix extracts that wait as `awaitBackendInitialization()`, has the reinit path call it too, and awaits it on all three read paths — at the dispatch seam for `memory_write`, so a new backend cannot be added without inheriting the wait. A rejection is swallowed at each call site deliberately: a backend that failed to initialize should surface as an honest `false`, not take the whole call down.
