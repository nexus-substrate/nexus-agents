---
'nexus-agents': patch
---

fix(consensus): correctness edges on the higher-order voting path (#3144 P0)

- `opinion_wise` now shares `higher_order`'s `fail_closed` default error policy instead of silently diverging to `reduce_denominator` (#3167) — it is an alias of higher_order.
- `OWVoting.algorithm` is constructor-configurable (defaults to `simple_majority`); `HigherOrderVotingStrategy` sets `opinion_wise` via the constructor so the label is correct whether built directly or via a factory (#3168).
- Correlation recording no longer drops ALL data on a mixed-source panel — it records the real (LLM) votes and logs the excluded count, instead of leaving the correlation matrix permanently stale when one voter simulated/errored (#3170).
- Added the missing tests for these paths (#3171).

Investigated and **rejected** #3172 (a "restore uniform weights when all collapse to the floor" guard): equal downweighting of equally-correlated agents is correct, and the Bayesian weighted-average is invariant under equal scaling, so all-at-floor is not degenerate — restoring uniform would wrongly treat correlated agents as independent (guarded by the existing "all perfectly correlated" test).
