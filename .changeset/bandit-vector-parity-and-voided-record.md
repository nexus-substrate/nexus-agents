---
'nexus-agents': patch
---

fix two defects introduced by yesterday's own fixes

**The bandit trained on a different feature vector than it scored, on three
columns.** The previous fix corrected `budgetUtilization` and asserted the
invariant that `update` must see the vector `selectArm` scored — while the two
paths went through different converters. The select path builds via
`TaskProfile`, which quantizes complexity to 0.1 steps, adds a legacy +500
token offset, and emits `isReasoningTask` as 0/1; the update path used the
analysis directly, giving continuous complexity, no offset, and 0/0.5/1. The
half-unit error on `isReasoningTask` was an order of magnitude larger than the
budget column that was fixed. The update path now uses the same chain, and a
test asserts the whole vector rather than one column.

**A policy-voided vote recorded from the CLI as `rejected`.** The MCP writer
passes `errorVoided`; the CLI writer added yesterday passed four fields and not
that one, so `outcomeToDecision` read it as false. The CLI printed `no_quorum`
and the chain said `rejected`. Narrower than it sounds — the all-errors
fallback still catches the common case — but an error-policy short-circuit
where some voters returned was misrecorded, which is the distinction #4053
added the field for.

Both were found by an adversarial review of the commits that introduced them,
and both had tests that could not fail: the first compared one column of six,
the second asserted what was passed to a mocked recorder rather than what the
recorder would write.
