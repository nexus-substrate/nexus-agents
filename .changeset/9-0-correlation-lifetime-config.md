---
'nexus-agents': major
---

Remove the ignored `correlationMaxAgeMs` and `observationDecayFactor` keys from `HigherOrderVotingConfig` and its validation schema. Omit these keys from configuration. Correlation evidence remains lifetime evidence partitioned by each role's pinned model; use `maxProposals`, `maxObservationsPerAgent`, and `maxTrackedPairs` to bound retained history.
