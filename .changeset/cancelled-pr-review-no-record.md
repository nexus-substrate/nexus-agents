---
'nexus-agents': patch
---

A cancelled async `pr_review` no longer writes a governor-review record, and records no verdict.

- Fixes a fidelity bug. Before this change, a `pr_review` job cancelled with `cancel_job` carried on once its seats settled: it aggregated whatever seats had answered into a verdict and appended it to `governance/pr-review-records.jsonl`. Under the default `errorPolicy: 'standard'`, one answering seat out of five was enough. The governor-review gate reads that file, so a cancelled, partial review could count as review evidence.
- The review now stops once the seats settle, before any verdict is aggregated or any per-decision cost is recorded. The record producer checks the signal a second time, synchronously before the append, so a cancel that lands after the seats settled still writes nothing.
- The cancelled job record keeps `status: 'cancelled'` and gains `cancelledPartial: { partialVotes, seatsCast, panelSize }`, the same field a cancelled `consensus_vote` carries: the seats that had answered before the cancel, with no verdict. Sidecar job store only, as for `consensus_vote`.
- Synchronous `pr_review` calls, and `scripts/pr-review-local-ledger.ts`, are unchanged: they have no cancel signal. The `pr_review` MCP tool does not post to GitHub, so there is no post to suppress.
