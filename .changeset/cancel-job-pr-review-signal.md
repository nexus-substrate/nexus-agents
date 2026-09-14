---
'nexus-agents': patch
---

`cancel_job` now interrupts an in-flight `pr_review`, `supply_chain_tradeoff_panel` and `run_graph_workflow` job (#5393). Each of those tools' async runner takes the `AbortSignal` that `runAsJob` hands it: the two panels pass it to the vote collector, which stops launching the seats that have not started (a seat already inside its adapter call settles, since its cost is incurred either way), and the graph tool passes it to the executor, which stops at the next super-step. Their job records now report `signalAccepted: true` because the runner arity changed, not because it was asserted. Before this, cancelling a 5-voter `pr_review` marked the job cancelled and let every remaining voter run.

The six other async tools (`orchestrate`, `run`, `run_pipeline`, `run_dev_pipeline`, `run_workflow`, `execute_spec`) still report `signalAccepted: false`; their engines have no cancellation surface yet, and each site now says so in code (tracked in #6305).
