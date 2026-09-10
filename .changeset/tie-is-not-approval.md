---
'nexus-agents': minor
---

A tied vote is no longer reported as an approval. `QuorumValidator.validateQuorum` used to break an exact approve/reject tie toward `approve` (`approves >= rejects`), so a 3-3 panel at `agreementThreshold: 0.5` — the schema minimum — came back as `{ status: 'reached', decision: 'approve', confidence: 0 }`, and `VotingProtocol`'s `determineOutcome` then reported it as `approved`, discarding the zero confidence that was the only remaining sign of the deadlock (#6051).

A tie now returns the existing `{ status: 'not_reached', reason: 'no_consensus' }` variant with `details` naming the tie (for example `tie: 3 approve vs 3 reject; consensus not reached`), and `VotingProtocol` reports `needs_revision` for it. No new `status` or `reason` member was added, so exhaustive switches over `QuorumValidationResult` keep compiling. Weighted tallies are sums of voter weights, so a tie is judged with a 1e-9 tolerance: sums that differ only by IEEE-754 rounding (`0.1 + 0.7` vs `0.8`) are a tie; a real weight difference is not. Callers that relied on `>=` handing a 50/50 split to `approve` will now see `not_reached` for that case; 4-2 at 0.5 and every non-tied outcome are unchanged.
