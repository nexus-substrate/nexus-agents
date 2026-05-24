---
'nexus-agents': patch
---

**perf(context):** `RoutingMemory.getPreferences` caches per-taskType results (closes #2955 site 4).

Pre-fix, every `getPreferences(taskType)` call did N=`CLI_NAMES.length` MobiMem profile lookups followed by an in-place sort, on every `CompositeRouter.route()` invocation. With `enableRoutingMemory=true` (default with persistence on), most calls produced empty results after the N lookups — pure waste on the routing hot path.

### Fix

- Added `preferencesCache: Map<string, readonly ModelPreference[]>` on `RoutingMemory`.
- `getPreferences` returns the cached entry on hit (O(1)); on miss, does the original full `CLI_NAMES` sweep, freezes the sorted result, caches it, and returns. The CLI_NAMES sweep is preserved on cache miss so MobiMem data written by another `RoutingMemory` instance or a prior session (shared singleton from #2719) is still observed on first read.
- `storePreference` invalidates the per-taskType cache entry (O(1) `Map.delete`) so the next read rebuilds with the new observation included.

### Why the cache is safe

The cache is correct within a single `RoutingMemory` instance's lifetime, which matches `CompositeRouter`'s usage pattern (process-singleton via `getGlobalRegistry()`). Cross-instance writes to the shared MobiMem aren't detected, but in practice no second instance writes to it during normal operation. If that changes, the cache can be invalidated externally by calling `storePreference` with any value, or replaced with a TTL-bounded variant.

### Test coverage

3 new tests (`routing-memory.test.ts`):

- Second read returns the **same reference** (cache hit confirmed).
- `storePreference` to a cached taskType invalidates and the rebuilt result reflects the new observation (different reference + higher strength).
- Cache invalidation is **scoped to the modified taskType** — writing to `task-y` does not invalidate `task-x`'s cache.

28 tests pass (was 25); `tsc + eslint` clean.

Closes #2955 site 4. Sites 1, 2, and 3 (partial) shipped in #3005.
