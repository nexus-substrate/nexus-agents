---
'nexus-agents': patch
---

fix(pipeline): fall back to a runnable template instead of failing on unimplemented stages (#3487)

A research-shaped task auto-classified to the `research` pipeline template, whose
`investigate`/`synthesize` stages have no implementation in any registry, so
`run_pipeline` hard-failed with "Missing stage implementations". The orchestrator
now validates the resolved template against the stage registry and substitutes a
satisfiable built-in template (general → dev) when stages are missing, so the
research/plan/vote workflow runs end-to-end instead of erroring. The fallback
compile error is also now actionable — naming the template, the missing stages,
and the available stages — so an unimplemented-stage failure is distinguishable
from an auth or transport error.
