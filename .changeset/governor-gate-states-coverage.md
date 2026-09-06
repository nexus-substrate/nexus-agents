---
'nexus-agents': patch
---

The governor pr_review gate now states which portion of the diff it verified.
`computeReviewedDiffHash` truncates to `MAX_REVIEWED_DIFF_BYTES` as part of the
canonical form, so content past the cap is unbound on both the producer and the
gate side — two diffs identical in their first 50 KB hash the same however they
differ after it, and `git diff` orders by path, so a new file sorting last lands
entirely past the cap. The gate held the diff string, computed the hash and
dropped it; `reviewedDiffWasTruncated` lives in the same module and had exactly
one caller, which logs at review time where no consumer of the ledger can read
it. A pass over a truncated diff is now labelled `PARTIAL` with the unattested
portion named.
