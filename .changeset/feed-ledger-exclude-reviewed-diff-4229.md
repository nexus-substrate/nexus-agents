---
'nexus-agents': minor
---

feat(audit): feed the pr-review ledger from pr-review-local; exclude the ledger from the reviewed-diff hash (#4229)

Two changes behind the #3831 Option-C governor-review gate (epic #4226, child B):

- **Reviewed-diff primitive (security-sensitive).** `canonicalGitDiffArgs` now
  appends `-- :(exclude)governance/pr-review-records.jsonl`, excluding the
  append-only pr-review ledger from the canonical reviewed diff. This makes
  committing a pr_review record to the PR head safe: previously, committing the
  record advanced head, changed `git diff base..head`, and self-invalidated the
  record's stored `reviewedDiffHash`. The same `canonicalGitDiffArgs` is used by
  both the producer and the gate recompute, so the exclusion applies identically
  by construction. ONLY the exact ledger path is excluded (not a glob/dir), the
  ledger's integrity is still fully checked by `verifyPrReviewRecordSet`, and a PR
  that edits the ledger still cannot smuggle non-ledger code changes past review.

- **Feeder.** `scripts/pr-review-local.ts` now fetches the PR base+head SHAs,
  generates the reviewed diff canonically (byte-identical to the gate recompute,
  ledger-excluded), and after the live 5-voter panel calls `persistReviewRecord`
  so the run's authentic verdict lands in the governance ledger the gate queries.
