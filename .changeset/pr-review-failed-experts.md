---
'nexus-agents': patch
---

fix(review): stop a PR review where every expert failed from approving

`createFailedReview` returned `approved: true` — "don't block on failures" — so
an expert whose adapter never ran was indistinguishable from one that read the
diff and had no objection. With the default three experts and an unavailable
adapter, `determineDecision` saw no findings and unanimous approval, resolved to
`approve` at 100% consensus, and `postReviewToGitHub` submitted a real APPROVE
event on a PR nobody read.

It also defeated the guard added for exactly this class: `allOf(reviews, …,
whenEmpty: false)` (#4581) refuses to call _zero_ reviews unanimous approval,
and three synthetic approvals walked around it by making the list non-empty.

`ExpertReviewResult` now carries `errored`, a failed expert is `approved: false`,
and the decision is computed over experts that produced a verdict — refusing to
approve when none did. A HIGH finding on an unreviewed PR still reports
`request_changes`, not `comment`.
