---
'nexus-agents': patch
---

refactor(eval): extract the per-role confidence rubric into a parameterized
`BaseEvaluator.computeConfidence`. Architecture-fit, practical-value, and
code-quality each keep their own base/cap/coeff (and code-quality its concern
penalty) — the method is parameterized, not flattened, so confidence output is
byte-identical for every input (#4290).
