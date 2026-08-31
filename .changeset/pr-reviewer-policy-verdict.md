---
'nexus-agents': patch
---

fix(dogfooding): gate review posting on the policy verdict, not a re-derived one

`postReviewToGitHub` blocked on `hasRuleOfTwoViolation` alone while
`evaluatePolicy` had already computed `allowed` and `requiresApproval`, both of
which `auditReviewAction` discarded.

Measured before changing anything, by driving `evaluatePolicy` with the exact
action `auditReviewAction` builds: tiers 1-2 produce no violations, and tiers
3-4 produce `INSUFFICIENT_TRUST` + `UNTRUSTED_INFLUENCE` + `RULE_OF_TWO`
together. The narrow gate and the full verdict are therefore **equivalent
today**, and no review is published against a blocking verdict. This changes no
behaviour.

What it changes is that the equivalence becomes guaranteed rather than
accidental: it holds only because `auditReviewAction` hardcodes
`hasWriteAccess: true` and `hasSecretAccess: true`, which is what makes
`checkRuleOfTwo` fire at tier 3+. Make either conditional — a read-only token
path — and `RULE_OF_TWO` stops firing while the other two blocking rules still
do, and a review would post against `allowed: false`.

The decision moves into `reviewPostingBlock` in `pr-reviewer-helpers.ts` so the
divergent case is directly testable. `requiresApproval` deliberately does not
gate: it is true exactly when `allowed` is true, so blocking on it would refuse
every review that passed.
