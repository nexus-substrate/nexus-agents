---
'nexus-agents': patch
---

fix: nine verdict aggregations no longer report a pass over zero items

`[].every(p)` is `true`, so a verdict aggregated over an empty collection reported success having measured nothing. A census of all 68 non-test `.every()` call sites found ten that were both unguarded and verdict-shaped; nine are fixed here (the tenth is on the governance path and is tracked separately for owner ratification).

- `release-announce`: `--channels=bogus` filtered to zero channels and the command reported `success: true`, printed the all-clear banner, and exited 0 having announced nothing. Unknown channels are now rejected outright, and the three downstream verdicts name the empty case.
- `voting-protocol`: an empty committee made `allVoted` true, finalizing a session as `completed` on zero ballots.
- `collaboration-session`: a session with zero participants recorded `All experts failed` — a failure attributed to nobody.
- `parallel-executor`: `allSucceeded([])` reported a branch that produced no step results as fully successful.
- `scenario-runner`: a scenario with no expectations reported `passed: true` having asserted nothing.
- `pr-reviewer-helpers`: with zero reviews `allApproved` was true, so a HIGH-severity finding downgraded from `request_changes` to `comment` on an unreviewed PR.
- `ab-test-tracker`: an experiment with zero variants reported `hasMinimumSampleSize: true`, so a zero-sample experiment read as statistically powered.

Each site now goes through `allOf` from `verdict-aggregation` with an explicit `whenEmpty`, and each carries a comment saying what empty means there and why.
