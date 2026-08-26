---
'nexus-agents': patch
---

fix(memory): report what memory_write actually persisted

`memory_write` returned `{ success: true }` for writes the backend had
rejected. `recordKnowledge`, `storeAdaptive` and `storeTyped` returned `void`,
checking their `Result` only to emit a `debug` line; `recordBelief` never
inspected its `Result` at all. The caller had no value to look at, so the tool
reported success unconditionally and the declared `error` field was reachable
only for an unconfigured backend — never for a runtime write failure. A
read-only SQLite file was indistinguishable from a successful write.

All four now return a `MemoryStoreOutcome` and the tool reports the reason.

The dedup cache had two related defects. It recorded the write _before_
dispatch, so a failed write poisoned it and the identical retry returned
`success: true, deduplicated: true` — asserting content was already stored that
nothing had ever stored. And its key omitted the backend, so writing the same
key+content to `session` and then `belief` reported the second as a duplicate
while the belief store never received it. The key now includes the backend and
the full content (the old 100-character prefix collided), and only a write that
landed is remembered.
