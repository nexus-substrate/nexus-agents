---
'nexus-agents': minor
---

A cancelled async `consensus_vote` now records the votes cast before the cancel, and no longer records a decision.

- When `cancel_job` lands mid-vote, the job record keeps `status: 'cancelled'` and gains a `cancelledPartial` field once the vote body settles: `{ partialVotes, seatsCast, panelSize }`. `partialVotes` holds the seats that had cast a vote. A seat aborted by the cancel or never launched is not counted. `seatsCast` is always the length of `partialVotes`, so a cancel before any seat answered reads `seatsCast: 0` of `panelSize`, not an absent field. The field is written only to the sidecar job store. A read through `NEXUS_JOB_RESULT_SOURCE=task_state` does not carry it, and a poll between the cancel and the body settling sees `cancelled` without it.
- Fixes a fidelity bug. Before this change, the cancelled body carried on after the cancel. It tallied whatever seats had answered, computed a decision from that partial panel, recorded it to the voter-correlation tracker, and appended it to the runtime vote-record ledger (`vote-records.jsonl`). The job record itself showed none of this. Now the vote stops before any tally: no verdict is computed from a cancelled panel, and nothing is appended to the ledger or the tracker. This includes a cancel that lands after every seat has answered but before the verdict, for example during the quick-mode contrarian check.
- A later complete or failed write still cannot change a cancelled record (#4022). The new writer (`attachCancelledPartial`) acts only on a record that is already `cancelled` and does not yet carry partials. It adds that one field and never changes the status.
- The `run` tool's `consensus` strategy now rejects with `VoteCancelledError` on a cancel instead of returning a verdict computed from the partial panel.
