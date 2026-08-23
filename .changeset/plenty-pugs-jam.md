---
'nexus-agents': minor
---

feat(audit): record what a pr-review record was derived from (#4459)

PR-review ledger records now carry an optional, **hash-covered** `diffProvenance`
descriptor so a consumer can tell what the record was derived from:

- `source: 'canonical-git' | 'caller-supplied'` — `canonical-git` when the reviewed
  bytes are the pinned `git diff <base>..<head>` the CI gate itself recomputes
  (`scripts/pr-review-local-ledger.ts`), `caller-supplied` when they arrived as
  opaque `prDiff` input on a `pr_review` MCP call. Those are the only two producers,
  so there are only two values: the `gh` v3.diff fallback skips the ledger entirely
  and can never write a record.
- `fileBoundaries: boolean` — whether the real `splitByFile` result attributed the
  diff to files. `looksLikeUnifiedDiff` deliberately accepts plain `diff -u` output,
  which has no `diff --git` headers, so this is the one signal a consumer cannot
  re-derive from the record's other fields.

`computePrReviewRecordHash` builds its canonical form from an explicit field
allowlist, so the field is added **to the projection**, not just the schema — a
provenance claim outside the self-hash could be upgraded from `caller-supplied` to
`canonical-git` with no `hash_mismatch`. A record written without provenance still
hashes exactly as before (the key is omitted, not emitted as `null`), pinned by a
golden-hash test.

Record `version` moves `'1.1'` → `'1.2'` as the pre/post-provenance boundary marker.
No migration: `governance/pr-review-records.jsonl` holds 0 records.

Also fixes a misleading log in `scripts/pr-review-local.ts` that printed
`(canonical, ledger-excluded)` — it means the diff excludes the ledger _file_, not
that the review is excluded from the ledger.
