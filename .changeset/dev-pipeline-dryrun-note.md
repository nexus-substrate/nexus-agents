---
'nexus-agents': patch
---

stop telling dry runs to retry with a dispatch mode they ignore

`run_dev_pipeline` appended the same hint to every synchronous error envelope —
_"Retry with `dispatch: 'async'` to get a jobId immediately"_ — including for
dry runs, where `dispatch` is explicitly ignored. A caller following it gets
another synchronous run and no explanation. The failure note now matches the
dispatch mode actually available: dry runs are told they are synchronous and
why, real runs still get the async escape hatch they can use.

Reporting only. Whether dry runs should be eligible for async at all is the
open question in the issue: they are excluded on the stated grounds that
"plan+vote completes fast", and a vote on this substrate measured 255s with 3
voters and 319s with 7.
