---
'nexus-agents': patch
---

`pr_review` audit records now carry what the panel read and what the hash binds as structured, hash-covered fields. A record written for a review that dropped files from the panel prompt has a `coverage` field (`panelRead`, `reviewedFiles`, `totalFiles`, the complete `droppedFiles` list, `reviewedBytes`, `totalBytes`, the panel budget's source and derivation) and a `binding` field (`kind: 'full' | 'prefix'`, `boundBytes`). Both are folded into the record's self-hash, so removing a path from the dropped-file list is a `hash_mismatch`. Before this the list lived only in the 500-character `summary`, where a review that dropped forty files kept seventeen of the paths and lost the binding stamp entirely. The summary stamp now reads `40 dropped (3 listed): …` with the count always the total, so the cap can reach the title but never the evidence.

Records are written at schema version `1.4`; version `1.3` records still parse and re-hash byte-identically, because the new fields enter the hash only when present. The governor-review gate (`scripts/check-governor-review.ts`) reports a partial panel read in its pass line, reading the structured field first and falling back to the summary stamp for a `1.3` record, and says which source it used.

The `reviewed-diff-hash` module documentation no longer claims the voters never see past the 50,000-byte cap. That cap is the binding cap: the panel may read the whole diff when it fits the voters' context windows, and the record states both portions.
