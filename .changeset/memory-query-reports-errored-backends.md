---
'nexus-agents': patch
---

fix(mcp): `memory_query` says when a backend threw instead of reporting an empty result

Each per-backend query helper catches its own error, logs at debug, and returns
`[]`. The empty array is right — partial results beat none — but it left a
corrupted SQLite file indistinguishable from a store that simply matched
nothing, and the response reported both as a successful search.

The helpers now take a `MemoryQueryContext` carrying an optional `onFailure`
reporter alongside the logger, `queryBySource`/`queryAll` thread a per-source
reporter through it, and the new `ToolMemoryManager.queryWithStatus` returns the
failing source names next to the results. `memory_query` surfaces them as
`errored` — on the single-source path as much as on `'all'`, so the field always
means "observed to throw", never "not checked".

Completes the second half of #4999; the first half (`searched`/`unavailable`,
which backends were installed at all) shipped in #5044.
