---
'nexus-agents': patch
---

fix(mcp): memory_stats reports real session task and error counts (#5269)

`memory_stats` initialised `{ learningsCount: 0, tasksCount: 0, errorsCount: 0 }`
and only ever assigned `learningsCount`. The other two were returned as `0` on
**every** call, forever.

The sibling field in the same response makes it worse rather than better:

```ts
session: true, // Always available
```

So a caller read *"session memory is healthy, and it holds 0 tasks and 0 errors."*
The positive backend assertion **corroborated** the fabricated zeros instead of
qualifying them — the same shape as #5252, where `Total Decisions: 412` sat
beside a rate computed over zero.

The counts were never absent. The session episode has held `tasksCompleted` and
`errorsResolved` all along — visible in `tool-memory.ts`'s own `endSession` log —
they were simply not readable mid-session. `SessionMemory` gains
`getCurrentSessionTasks()` and `getCurrentSessionErrors()`, siblings of the
existing `getCurrentSessionLearnings()`, and `ToolMemory.getSessionCounts()`
passes them through.

No `?.` guard on the new call, deliberately: a defensive read would silently
restore the fabricated zeros if the wiring ever broke, which is the defect this
fixes.
