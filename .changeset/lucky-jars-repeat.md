---
'nexus-agents': patch
---

Refuse to write the source checkout's own pr-review audit chain from a test (#4415)

`governance/pr-review-records.jsonl` is tracked, hash-chained, and read by `verify_audit_chain`. A test previously appended three fabricated verdicts to it — they chained correctly onto each other, so a valid chain containing fake reviews would have read as genuine. They were caught only because `git status` showed a tracked file dirty.

`persistPrReviewRecord` now throws when, under a test runner, the resolved destination is the source checkout's own tracked chain. The guard keys on the **destination**, not on how it was derived, so an explicit `filePath` or `NEXUS_PR_REVIEW_RECORDS_PATH` aimed at the same file is refused too. Writes into a throwaway repo — the shape a legitimate persistence test uses — are unaffected, and production behaviour is unchanged.

Path _resolution_ stays unguarded: it is a query, and tests legitimately assert its fall-through behaviour (#4278/#4312) without writing anything.

The CI working-tree check now also treats a modified `governance/` file as a leak, catching any writer the runtime guard does not.
