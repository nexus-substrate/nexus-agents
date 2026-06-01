---
'nexus-agents': patch
---

refactor(core): extract canonical BoundedLRUCache; adopt in PolicyCache (#3292)

First step of the cache consolidation (epic #3288 item 4, scoped by verify-first):
adds `core/BoundedLRUCache<K,V>` — the single size-bound LRU implementation that
was hand-rolled across several caches — and adopts it behind `PolicyCache`'s
existing interface (dropping its unused `insertedAt` field). Behavior-preserving:
the existing PolicyCache tests pass unchanged. The TTL-bearing and domain-specific
caches stay separate (per the #3292 scoping).
