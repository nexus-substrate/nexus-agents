---
'nexus-agents': patch
---

feat(capability-loop): fail-closed untrusted-input boundary in the dev-pipeline (#3643)

Closes the Rule-of-Two hole the #3618 capstone vote surfaced: running the
dev-pipeline inside the IMPLEMENT phase (write+secrets) would let its research
stage perform a fresh untrusted read, coinciding all three legs. The dev-pipeline
now takes two opt-in `DevPipelineOptions` (default behavior unchanged):

- `untrustedInputGuard` — called at the RESEARCH chokepoint (the untrusted-read
  site); the enforce path wires it to `CapabilityLedger.assertCapability('untrusted-input')`
  so a fresh read in the IMPLEMENT phase throws `RuleOfTwoViolation` (fail-closed);
- `researchOverride` — runs the pipeline plan-only from the typed RemediationPlan
  with no untrusted read.

Glue helpers `untrustedInputGuardFor(ledger)` and `renderPlanAsResearch(plan)`
connect the #3613 ledger to these hooks. Ship-blocking test: an IMPLEMENT-phase
ledger fail-closes a dev-pipeline untrusted read. Unblocks #3618.
