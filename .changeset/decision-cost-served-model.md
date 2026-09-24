---
'nexus-agents': patch
---

The per-decision cost rollup on `consensus_vote` and `pr_review` now names and prices each seat by the model the adapter reported answering, not the alias the seat requested. A seat whose CLI fell back to another model (for example `claude-fable-5` answered by `claude-sonnet`) was recorded under the requested alias and priced at its rate; `perVoter[].model`, `perModel` and `totalCostUsd` now follow the served model, priced the same way as the consensus outcome rows. A seat that reported token usage but no served model is recorded under `unknown` with `priceBasis: 'unknown'` and no cost, counted as unmeasured rather than as a $0.
