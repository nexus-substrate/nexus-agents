---
'nexus-agents': minor
---

pr_review records bind to the reviewed DIFF, not headSha (#3831 Option-C)

Migrates the authority `PrReviewRecord` schema (1.0 → 1.1) and the governor-path gate (`scripts/check-governor-review.ts`) from the rejected `headSha` binding to the ratified Option-C `{prNumber, baseSha, reviewedDiffHash}`. `reviewedDiffHash` is the sha256 of the canonical reviewed diff — a single shared `audit/reviewed-diff-hash.ts` pins the exact `git diff` invocation (algorithm/context/prefixes/autocrlf, two-dot range) + a 50k byte-boundary truncation so the producer and the gate cannot drift (proven by a cross-environment, hostile-gitconfig test). The gate now recomputes `reviewedDiffHash` from the committed PR's `base..head` and matches it; a record bound to a different diff does not satisfy the gate. The gate STAYS warn-first (no fail-closed flip). The committed `governance/pr-review-records.jsonl` ledger is empty on every install, so the schema bump needs no data migration. Ratified 7/0 (higher_order). The producer that writes these records is a tracked follow-up.
