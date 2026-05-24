---
'nexus-agents': patch
---

**fix(mcp):** `search_codebase` no longer races on cold-start, evicts stale indexes, and bounds retention. Closes #2970.

The previous module-level `cachedIndex` / `cachedDir` pair had two coupled bugs:

1. **Singleton-init race.** Two concurrent MCP `search_codebase` calls both missed the cache and each `await index.index(4)` (a seconds-long tree-walk + AST extraction over every TS/JS file). The loser's work was wasted.
2. **Unbounded retention with stale results.** `CodebaseIndex` (~50,000 symbols × ~200 bytes for this repo) was kept for the life of the MCP server with no TTL, no LRU, no file-watcher invalidation. Memory grew + search results went stale after the user's first `git pull` / file edit.

Fix: replace the pair with a small bounded cache (`MAX_CACHED_DIRS = 3`, `INDEX_TTL_MS = 15 minutes`) plus an `inflightIndex` `Map<dir, Promise<CodebaseIndex>>` that coalesces concurrent indexing of the same directory. LRU eviction uses `Map` insertion order: cache hits delete-then-reinsert the entry, demoting LRU candidates to the head. Mirrors the `PolicyCache` pattern in `security/access-constraint-deriver/cache.ts`. TTL is computed via `getTimeProvider()` so seeded tests reproduce.

5 new tests cover: race coalescing (one constructor call on two concurrent calls), LRU eviction past 3 dirs, LRU refresh on cache hit, TTL expiry past 15 min, `clearIndexCache()` clearing inflight promises. The 3 existing cache tests (#2159) still pass against the new implementation. 24 tests in the file; tsc + eslint clean.
