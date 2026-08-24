---
'nexus-agents': patch
---

fix(consensus): say whether the higher-order analysis actually decided the vote

`strategy: 'higher_order'` does not produce a higher-order verdict. The decision
comes from `ConsensusEngine.close()` → `HigherOrderVotingStrategy.calculateOutcome`,
which calls `aggregateSimpleInternal` — a plain `approve / (approve + reject)`
ratio with no correlation input. The correlation-aware run happens separately
and is consumed only as response metadata plus one escalation check.

That made the metadata actively misleading rather than merely incomplete:
`method` can read `'ow'` with a non-empty `downweightedAgents`, from which a
reader reasonably concludes the correlation analysis produced the verdict. It
did not — the "several voters that are really one opinion" case is detected and
then discarded.

`HigherOrderMetadata.appliedToDecision` now states this, and it travels into the
persisted vote record, which is the artifact a later reviewer trusts. It is
hardcoded `false` rather than computed, because no code path currently routes
that result to the verdict and a computed `false` would imply one exists.

Making the tally genuinely correlation-aware changes governance outcomes and is
tracked separately. This makes the current state legible in the meantime.
