---
'nexus-agents': patch
---

Correct the `consensus_vote` `higher_order` strategy description. It said "Bayesian-optimal", but its verdict is a plain approve/reject tally at a 0.5 bar. The correlation-aware posterior is computed, but it only triggers contrarian escalation and does not weight the decision (#4701). Behaviour is unchanged; only the description, JSDoc and architecture docs now say what the strategy does.
