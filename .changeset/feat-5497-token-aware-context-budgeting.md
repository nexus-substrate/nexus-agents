---
'nexus-agents': minor
---

feat(context): token-aware greedy budgeting for context retriever sections (#5497)

Replaces the fixed `slice(0, 5)` selection in `context-retriever-helpers.ts` with token-aware greedy budgeting (`sliceContextLines`). When an item exceeds the remaining section budget (default: 400 tokens), it is skipped in favor of subsequent smaller items that fit, while respecting the maximum item count cap (default: 5 items).
