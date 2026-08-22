---
'nexus-agents': patch
---

An option-split veto now records as `rejected`, not `no_quorum` ([#4529](https://github.com/nexus-substrate/nexus-agents/issues/4529)).

`applyOptionGate` vetoed correctly but wrote its explanation to `result.policyReason`. That field means one specific thing — "an error policy VOIDED this vote" — and `resolveVoteDecision` short-circuits any non-`undefined` value straight to `no_quorum`. So every multi-option veto was stamped as a void: the panel convened, every voter was heard, the gate measured a real split, and the record said nothing was decided.

The audit trail inherited it: `errorVoided` is derived from `policyReason`, which forces the persisted `VoteRecord.decision` to `no_quorum` too.

Worse, `--on-no-quorum=retry` re-runs a voided vote once, on the sound theory that a missing voice is worth re-collecting. A genuinely split panel took that branch — so the substrate would re-roll the panel and discard the dissent the gate had just detected. #4452 mislabelled a split; this could erase one.

The veto reason now travels on the `optionGate` verdict object, which already reaches the response and sits beside the tally that justifies it. `policyReason` keeps its single meaning, and `resolveVoteDecision` — shared by the engine and the response so the two cannot diverge (#4135) — is untouched. The response carries `optionOutcome.vetoReason`, declared in the advertised MCP schema so a strict client does not reject it.

Shape chosen by a 7-voter `higher_order` panel: 6 approvers, all selecting this option, zero unattributed. The panel's reasoning against the alternative of adding a discriminator to the shared resolver was that an optional discriminator reintroduces the same conflation by omission.

Why no test caught it: the gate's own unit tests are thorough and all passed. Nothing exercised the composition — `applyOptionGate` followed by `resolveVoteDecision`, the two consecutive lines in `executeVoting`. That composition now has a test.
