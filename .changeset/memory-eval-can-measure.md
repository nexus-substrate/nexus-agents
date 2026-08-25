---
'nexus-agents': minor
---

make memory-eval able to tell its two scorers apart

`memory-eval` exists to compare a baseline scorer against a reflective one, and
reported a delta of **exactly 0** on every metric at every dataset size — for
any pair of scorers. The comparison could not come out non-zero.

`generateEvalDataset` gave every irrelevant pair a unique query, so grouping by
query produced groups that were entirely relevant or entirely irrelevant, none
larger than `k`. A scorer's only influence is the order within a group; when
every item in a group shares one relevance label and the whole group fits inside
the top-k cut, order cannot move any metric.

- Irrelevant memories now answer the **same** query as their group, carrying
  another topic's content, so each group mixes relevant and irrelevant items.
- The number of distinct queries is capped so every group holds more than `k`
  memories, making the rank cut meaningful.
- A query with no relevant memory is excluded from the recall mean instead of
  being credited 1.0 — that free perfect score was 17 of 27 queries at the
  default size. `EvalMetrics` gains `recallQueries`, and the report says so when
  it is lower than `totalQueries`.

Reported numbers change substantially: at size 50, `Recall@5` moves from a
constant 1.0 to 0.486 baseline / 0.676 reflective, and the deltas become
non-zero. They were constants before, so any movement is the fix working.

Fixes #4850.
