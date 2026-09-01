---
'nexus-agents': patch
---

fix(cli): say when an option veto caused a rejection, not the approval percentage

`explainOutcome` distinguished three rejection paths and had no arm for the
fourth — a rejection driven by the option gate. That case fell through to the
threshold arm and printed the approve/reject percentage as its cause, which
in the live instance was a number that _clears_ the bar it claimed was missed:

```
Approval: 83.3%   Threshold: supermajority
Result: REJECTED — supermajority threshold not met (got 83.3%)
```

Supermajority is 67%. The engine's own cascade had logged
`Approval locked: 5/7 > 0.67`.

The real cause was in the persisted record all along:
`optionCoverage: {approverCount: 5, selectedCount: 1, unattributedApprovals: 4}`.
Five voters approved and one emitted a parseable `selectedOption`, so the
leading option tallied 1 and failed the bar over the option tally. `rejected`
was correct; the explanation was not.

The information existed end to end — `evaluateOptionGate` produces a `reason`
(#4529) and `executeVoting` attaches it to `result.optionGate` — and the CLI
dropped it at the last mile, because its own narrower return type omitted the
field. The type is widened and the reason is now printed, together with the
coverage counts: the reason says which bar failed, the counts say how much of
the panel the tally was measured over. Both are needed, because `4 pick X + 3
unparseable` and a real 4/3 split read the same on the share alone.

Ordered before the threshold arm and after both quorum arms, for the reason
`osvCoverageNote` is ordered that way (#5018): the specific cause has to be
checked first or it falls through to the generic one. Mutation testing found the
bare-quorum ordering was untested — moving the option check above it went
unnoticed — so that test exists now too.

Addresses #5362. The root cause of unattributed selections is #4495.
