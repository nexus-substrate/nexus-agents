---
'nexus-agents': patch
---

**Phase 9 of #2766** — one-shot cleanup for belief-backend rows polluted by the #2719-era arXiv feed-fallback bug. Closes #2775.

Pre-#2755 the `extractEntryXml` helper fell back to the feed-level `<title>` when an arXiv query returned no entries. The feed title for a no-results query is literally `arXiv Query: search_query=...`, which then got persisted as a "belief" with the bogus title as the subject. #2755 fixed the writer; this PR ships the reader-side cleanup.

New module `context/belief-cleanup.ts`:

- `classifyBelief(belief) → { polluted, matchedPattern? }`: pattern-match on `subject` / `predicate` / `object`.
- `runBeliefCleanup({ loadBeliefs, deleteBelief, markerDir, force })`: storage-aware driver. Marker file `.belief-cleanup-done` makes re-runs no-op.
- `readBeliefCleanupMarker()`: status display helper.

Storage callbacks are dependency-injected so production wires them to `HindsightBeliefMemory` and tests can inject in-memory stores.

13 regression tests cover classifier positive + negative cases (real `arXiv:NNNN.NNNNN` references kept intact), idempotency marker, force re-run, async callbacks, and the samples cap.
