---
'nexus-agents': minor
---

feat(governance): warn-first governor-path pr_review audit gate — sha-bound, chain-fail-closed (#3831, Epic B)

Stage 1 of governance-of-the-governor (#3829): a WARN-FIRST CI gate asserting
that a PR touching the GOVERNOR PATHS (the governance-of-the-governor entries in
`/CODEOWNERS`) carries a recorded, SHA-BOUND, tamper-evident `pr_review` audit
record before merge.

- New `PrReviewRecord` Zod schema + tamper-evident record SET model
  (`src/audit/pr-review-record.ts`), mirroring the #3927 vote-record model: each
  record is self-hashed and position-independent (merge-safe), and the self-hash
  covers `prNumber` + `headSha` + `verdict` (the sha-binding) plus the monotonic
  `sequence`. `verifyPrReviewRecordSet` detects edits (`hash_mismatch`), missing
  hashes, and omissions (`sequence_gap`); duplicate sequences are benign forks.
- New gate `scripts/check-governor-review.ts`. The governor path set is DERIVED
  from `/CODEOWNERS` (single source, no divergent copy). SPLIT fail-mode: chain/
  set INTEGRITY is fail-CLOSED (a tampered ledger exits 1 — tamper evidence),
  record ABSENCE is WARN-FIRST (exits 0 with an actionable annotation). A record
  satisfies the gate only when it matches the PR's number AND head sha — a stale
  sha does not count. Genesis exemption via `governance/governor-review-genesis.txt`.
- New `.github/workflows/governor-review.yml` (paths-filtered on the governor set;
  non-required, warn-first; integrity break still fails the job).
- Committed empty ledger `governance/pr-review-records.jsonl` (+ `merge=union`).

The PRODUCER (pr_review committing records, the caller-commits flow shared with
#3927) and the fail-closed FLIP (absence → block) are tracked follow-ons.
