---
'nexus-agents': minor
---

feat(observability): close feedback loop decision and enforce domain boundaries (ADR 0020, #4289)

Formalizes the architectural decision closing Issue #4289 via consensus vote (Option B):

- EventBus remains the sole canonical signal bus for typed observability and self-tuning events (`signal.*`); a duplicate `IFeedbackCoordinator` is rejected per anti-sprawl.
- `signal.fitness_declined` is confirmed strictly scoped to tech-debt/remediation (`flag_tech_debt`) and deliberately decoupled from `adaptive-thresholds` and routing multipliers.
- Added negative invariant tests (`tune-stage-invariants.test.ts`) guaranteeing that fitness signals never trigger routing demotions or mutate outcome baselines.
