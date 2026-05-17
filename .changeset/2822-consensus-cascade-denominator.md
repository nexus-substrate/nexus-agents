---
'nexus-agents': patch
---

**Closes #2822.** fix(consensus): canCascadeEarly uses wrong denominator vs strategy — wrong-winner with abstains

The agreement-based cascade in `ConsensusEngine.canCascadeEarly` computed approval rates against `totalExpected = requiredVoters.length` and compared against `VOTING_THRESHOLDS[algorithm]` directly. Every voting strategy (`SimpleMajorityStrategy`, `SupermajorityStrategy`, `UnanimousStrategy`, `ProofOfLearningStrategy`) uses `approve + reject` as its denominator — abstains explicitly excluded.

Pre-fix concrete failure: 5-voter `supermajority` with `[approve, abstain, abstain, abstain, pending]`. Cascade computed max approval = `(1+1)/5 = 0.40 < 0.67` → cascade-reject. Strategy at close (last approves): 2 approve / 0 reject / 3 abstain → 2/2 = 1.0 ≥ 0.67 → APPROVE. Different winners. Cascade also used strict `>` while supermajority/unanimous strategies use `>=`, mismatching at the exact threshold.

The fix delegates to the strategy itself: build a best-case (all pending voters approve) and worst-case (all pending voters reject) hypothetical vote map, call `strategy.calculateOutcome` on each, and cascade only when both extremes yield the same outcome. This guarantees parity with the strategy's denominator semantics and inequality operator by construction — including correct behavior for `higher_order`/`opinion_wise` (whose `IVotingStrategy.calculateOutcome` falls back to simple-vote aggregation; the Bayesian correlation path is invoked separately and is unaffected).

Three new regression tests cover (a) supermajority + abstain wrong-winner scenario, (b) cascade-fires-early when both extremes agree (no abstain confusion), (c) supermajority `>=` boundary semantics. All 520 consensus tests pass; typecheck + lint clean.
