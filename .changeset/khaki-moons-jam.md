---
'nexus-agents': patch
---

fix(review): stop reporting a review as posted when GitHub rejected it (#4354)

`nexus-agents review` printed `Review posted to GitHub.` and exited 0 whenever the
review itself completed, regardless of what GitHub did with it. `postReviewToGitHub`
logged a `createReview` rejection and returned `void`, and a Rule-of-Two policy block
returned early the same way — so an HTTP 422 (the case that surfaced this: GitHub
refuses to let an author request changes on their own PR) produced a confident
success message over a review that does not exist, and a script gating on the exit
code saw nothing wrong.

`PRReviewResult` now carries a `postOutcome` of `posted` / `skipped` (with a reason)
/ `failed` (with the error). Both `review` and `review --demo` report what actually
happened and exit 1 when the post failed. A policy-gate skip is stated plainly and
still exits 0 — it is a deliberate governance outcome, not a fault — and dry-run
stays quiet because the header already says so.

The aggregated review is typed as `PRReviewDraft` until the posting step runs, so
`postOutcome` cannot be defaulted to a hopeful value.
