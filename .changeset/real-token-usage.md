---
'nexus-agents': patch
---

fix(workflows): record real token usage in the budget ledger instead of wall-clock time

`recordPhaseUsage` recorded `Math.round(result.durationMs * 0.5)` — a duration
reading in a field named tokens, with a comment conceding "in real usage, this
would come from actual token counting". A budget enforced against that would
cap on elapsed time: a slow-but-cheap step could exhaust it while a fast
expensive one passed.

The real count was already on the step's task metadata (populated from adapter
usage); `step-executor` dropped it when building `StepResult`. It is threaded
through now.

An unmeasured step is NOT recorded as zero. For a cap, under-counting spend is
the dangerous direction — the budget would believe it had headroom it does not.
Unmeasured steps are counted and returned in a new `PhaseUsageReport`, so a
caller enabling enforcement can see whether the ledger it enforces against is
complete; `unmeasuredSteps > 0` means the recorded spend is a lower bound.

Budget enforcement itself remains off, deliberately — it is separately
unreachable (#4673), and turning it on before the estimate was real would have
enforced a cap against a clock.
