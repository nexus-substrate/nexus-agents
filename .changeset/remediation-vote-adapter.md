---
'nexus-agents': patch
---

feat(capability-loop): consensus vote adapter for auto-remediation (#3648)

`makeVoteAdapter` is the `AutoRemediationDeps.vote` implementation — it runs a
REAL consensus vote (live voters, `simulateVotes` hard-forced false per #2319) at
the priority-required algorithm via the canonical `executeVoting` path, mapping
the result to `{ approved, approvalPercentage }`. The voter proposal is the strict
typed plan rendering (#3613). `buildVoteInput` (exported, tested) guarantees
no-simulation + correct strategy; the runner is injectable for unit tests.
