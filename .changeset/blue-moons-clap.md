---
'nexus-agents': patch
---

memory_stats: `session.learningsCount` reads the live session instead of a rendered retrieval snippet (#5858)

The count was derived by calling `getRelevantLearnings('', 1000)` and counting the lines of the string it returns. An empty query matches no learning — `''.split(/\s+/)` is `['']`, filtered out by `k.length > 1`, and `matchesKeywords` returns `false` for an empty keyword list — so the call **always** fell through to the fallback branch's hard `.slice(0, 3)`. The `1000` was inert and the reported count could never exceed 3. Worse, `getRelevantLearnings` returns `undefined` when `pastLearnings` is empty, so a fresh session that had recorded learnings reported 0 while the sibling `backends.session: true` asserted the backend was up.

`getSessionCounts()` now returns all three counts from the same live accessors, matching the fix #5269 applied to `tasksCount` and `errorsCount` on the same struct. Counting records through a retrieval formatter — which borrows a relevance slice as if it were a total — was the mistake.
