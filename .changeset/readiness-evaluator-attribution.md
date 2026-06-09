---
'nexus-agents': patch
---

fix(capability-loop): derive readiness evaluator/owner deterministically by reviewedAt

The auto-remediation soundness-review summary (#3765) selected the named
evaluator/owner from the last-appended record rather than the most recent by
`reviewedAt`, so hydrate/append order could shift the named-evaluator the
enforce readiness gate reads. Now selected by max `reviewedAt`. Adds a
regression test for the attribution + exact-boundary (0.8/0.9, `>=`) readiness
tests. Surfaced by the #3770 adversarial security/QA review.
