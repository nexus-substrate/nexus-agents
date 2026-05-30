---
'nexus-agents': patch
---

**feat(skills):** codify the blind pre-merge-review pass in `reviewing-code` (#3074).

Adds a "Pre-merge blind-reviewer pass" section to the existing `reviewing-code` skill (extended, not a new skill — per a 3/3 `consensus_vote` on anti-sprawl): after local gates are green and before merging, spawn a fresh `code-reviewer`/`Explore` subagent on the diff, blind to the author's reasoning, returning BLOCKER/WARN/NIT findings that map onto the skill's existing Critical/Important/Suggestion categories. The pattern caught a real merge-blocking bug on 6 of 22 PRs (27%) in a prior autonomous session.

The section references the existing five-axis framework + 4-point Verification Gate (no restatement) and primes the reviewer on bug-shape _classes_ (accessibility/semantics drift, test brittleness, double-emitted output, layout/state clobbering, contract drift) rather than a frozen list, to avoid overfitting. Discoverability added via "pre-merge review" / "blind reviewer" / "before merge" trigger keywords. #3074 proposals #2 (ship-velocity signal) and #3 (failure-mode memory pre-loading) remain tracked in that issue.
