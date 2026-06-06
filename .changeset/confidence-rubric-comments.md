---
---

refactor(self-eval): document the confidence rubric in arch-fit + practical-value evaluators

Bring ArchitectureFitEvaluator and PracticalValueEvaluator into line with
CodeQualityEvaluator's self-documenting confidence calc — named locals (base,
metricBonus) + a rationale comment instead of bare literals. Identical arithmetic,
zero behavior change (170 self-eval tests unchanged); makes the confidence rubric
auditable as #3245 asked. No release impact.
