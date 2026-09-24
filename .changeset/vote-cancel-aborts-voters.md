---
'nexus-agents': patch
---

`cancel_job` on an async `consensus_vote` now stops the voters that are already running. Before, a cancel only stopped voters that had not started yet: voters already calling their model ran to completion (90–120 s on a live panel) and used quota after the cancel. The cancelled job also held its async concurrency slot until the slowest voter finished, so the next async vote could come back `busy`.

- The job's cancel signal now reaches each voter's model call, combined with that voter's own deadline. A cancel is recorded as a cancel, and a deadline that fires is still recorded as a timeout.
- A cancelled voter is not retried, a cancelled panel skips the errored-voter retry pass, and a voter whose adapter ignores its signal is no longer awaited after the cancel. The job settles promptly and frees its slot.
- The `consensus_vote` schema doc no longer promises a `partialVotes` field on a cancelled job. That field was never written: the job record stays `{ status: 'cancelled' }` with no vote payload.
