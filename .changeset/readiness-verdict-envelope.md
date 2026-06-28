---
'nexus-agents': patch
---

Extract the shared readiness-verdict envelope (#4096, epic #4094). The two
independent readiness evaluators — `codepr-enable-readiness` (the OFF→on enable gate)
and `improvement-enforce-readiness` (the shadow→enforce promotion gate) — carried
byte-identical copies of the `ReadinessCriterion` / verdict-envelope types. They now
share one authoritative `readiness-verdict.ts` (`ReadinessCriterion`, `ReadinessVerdict`).

Behavior-preserving and API-stable: each module re-exports the shared types under its
historical names (`CodePrReadinessCriterion`/`CodePrEnableReadiness`,
`EnforceReadinessReport`), and both keep their own `presenceCriterion` helper — the two
copies emit deliberately different `detail` wording ("no {label}" vs "no named {label}"),
a real domain difference that must NOT be unified. Only the envelope is shared.

Scope is the envelope ONLY, by design: a survey of all four corpus→score→verdict sites
(this pair plus pr-review-eval and the #4095 meta-strategy eval) confirmed their corpus
types, score functions, evidence shapes, and gate configs diverge and stay per-consumer.
The full labeled-corpus→score→verdict pipeline extraction is deferred until a third
corpus-based gate demonstrates a unified shape.
