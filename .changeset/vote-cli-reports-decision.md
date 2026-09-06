---
'nexus-agents': patch
---

The vote CLI now prints the decision it recorded. `executeVoting` stamps
`decision` without mutating the engine's 2-valued `result.outcome`, and
`computeAbsoluteQuorumDecision` returns `no_quorum` while the outcome stays
`approved` — so a voided vote printed `Result: APPROVED` in green while the
audit record, the GitHub comment and the exit code all said `no_quorum`. Every
persisted artifact was right and the one a human reads live was wrong.
`runVote` also now populates `optionGate`, which #5362 added to the return type
and never to the literal, leaving the option-veto explanation unreachable; and
the recorded GitHub comment marks an errored seat as `ERRORED` with the error
count, instead of publishing a failed voter as a genuine `ABSTAIN`.
