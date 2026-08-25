---
'nexus-agents': minor
---

give the LinUCB bandit a real budget feature

`taskProfileToBanditContext` hardcoded `budgetUtilization: 0.5` on every call,
so the bandit's budget dimension was a **constant**. A constant feature carries
no information: whatever coefficient LinUCB learns for it is meaningless, and
routing could never respond to budget pressure. This — not the prefix mismatch
in #4834 — is what actually pinned the feature.

It now takes the utilization the pipeline computes (#4869), falling back to the
neutral `0.5` when no cost ceiling is configured. Neutral rather than zero:
zero asserts "budget untouched", while `0.5` is the value `LinUCBBandit.warmStart`
replays historical outcomes at, so an unknown budget matches the context the
weights were reconstructed against.

`LinUCBStage.extractBudgetUtilization` parsed a `budget:utilization-` signal
(hyphen) that no producer emits. Rather than correcting the prefix, the parser
is replaced by a validated metadata read, consistent with #4866's decision that
cross-stage signals are not an input channel. An out-of-range value falls back
to neutral instead of being clamped — an implausible number is more likely a
wiring mistake than a measurement. The stage now states the value it used in
its trace.

**The `signal-contract` ratchet's `KNOWN_BROKEN` map is now empty.** Every
consumed routing-signal prefix has a producer.

`timePressure` is still hardcoded; no producer computes one anywhere in the
tree, so there is nothing to thread. Tracked separately.

Fixes #4834.
