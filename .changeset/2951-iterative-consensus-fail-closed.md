---
'nexus-agents': patch
---

**fix(pipeline):** `iterative-consensus` fails closed on vote-execution error. Closes #2951.

`executeSingleVote` previously caught any exception from the consensus-vote tool (subprocess crash, JSON parse failure, network error, rate limit) and returned `{ kind: 'approved', approvalPercentage: 0 }` — **auto-approving on infrastructure failure inverts the gate's purpose.** The dev pipeline would log "vote approved, proceeding to implement" when zero votes were physically cast.

Now returns `{ kind: 'rejected', feedback: 'Vote infrastructure failed — no consensus produced: <message>', approvalPercentage: 0 }`. `runIterativeConsensus` counts this against `maxIterations`, the operator sees the failure, and an unverified plan never proceeds because the vote couldn't run.
