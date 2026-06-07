---
'nexus-agents': patch
---

feat(capability-loop): deterministic research adapter for auto-remediation (#3648)

`buildRemediationPlanFromSignal` is the RESEARCH-phase adapter: it builds a strict,
typed RemediationPlan deterministically from the signal's own typed fields
(investigate → category-specific action → add regression test), performing NO
fresh untrusted read — so the safest possible research step, with no injection
surface. Downstream the dev-pipeline's plan→vote→QA stages do the real reasoning
on this typed plan via the #3643 researchOverride. Part of the #3648 enforce-path
adapter set.
