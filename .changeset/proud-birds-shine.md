---
'nexus-agents': patch
---

memory_write: the session backend reports persistence instead of intent (#5889)

`writeToSession` returned `{ success: true }` unconditionally. `ToolMemory.recordLearning` was `void` — it returned early when no session was active and swallowed a genuine store failure at `debug` level — so the tool had nothing to check. It was the fifth backend, and the only one #4997 left unchecked when it established that *"`memory_write` reports persistence, not intent"*; the other four all gate on `outcome.persisted`.

The second-order effect was #4997's own bug verbatim: `executeMemoryWrite` populates the dedup cache on `response.success`, so a dropped session write was remembered as landed and the identical retry short-circuited to `{ success: true, deduplicated: true }` — the tool asserting the content was already stored when nothing had ever stored it.

`recordLearning` now returns `MemoryStoreOutcome`, the shape the other four already use. Both failure modes were already computed there and thrown away. Every other caller ignores the value, as before, and the cross-backend belief retain is deliberately left outside the persistence check: the belief is a separate backend, and a session-store failure is not a reason to withhold it.
