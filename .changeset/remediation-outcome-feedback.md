---
'nexus-agents': patch
---

feat(capability-loop): Goodhart-resistant outcome feedback for remediations (#3616)

Condition 5 + the outcome-feedback increment of the #3540 auto-invoke gate.
`assessRemediationOutcome` defines what counts as a successful remediation for the
Darwinian selection loop, resistant to the obvious gaming:

success ≡ PR merged BY A HUMAN AND fitness recovered by ≥ minFitnessDelta
within the attribution window.

"PR opened"/unmerged and bot/auto-merges never count as success. Confidence is
`pending` (don't record) until the window elapses, `low` when confounded by
concurrent merges/CI noise, `high` otherwise. Pure logic; the enforce path
(#3618) supplies the inputs and records the recordable outcomes to the
OutcomeStore so the loop selects on measured results.
