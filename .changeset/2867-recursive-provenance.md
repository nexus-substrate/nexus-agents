---
'nexus-agents': patch
---

**fix(pipeline):** `ArtifactStore.provenance()` walks `inputRefs` transitively. Closes #2867 (#2824 audit P2).

`provenance()` previously returned only the queried artifact's direct entry — the `inputRefs` ancestors were never followed, so the "provenance chain" was one link long. It now does an iterative DFS over `inputRefs`, returning the artifact plus every transitively reachable ancestor. A `visited` set makes it safe against cycles and diamond/multi-parent DAGs (each artifact appears once); a FIFO-evicted ancestor truncates the chain rather than throwing.

Also corrected two stale docs: the store does **FIFO** eviction (insertion order), not LRU — header comments said "LRU". And the class docstring now states this is a bounded in-memory working cache, not the durable audit substrate — for retained, tamper-evident history use the on-disk Merkle audit log via `verify_audit_chain`. This resolves the audit's FIFO-vs-"audit trail" concern: the cache is correctly bounded; the durable audit lives elsewhere.
