---
'nexus-agents': patch
---

run: a forced strategy no longer suppresses the router's ambiguity verdict (#5897)

`buildForcedDecision` hard-coded `needsShaping: false`. That answers a different question from the one the caller asked: forcing a strategy says *which pipeline runs*, while `needsShaping` says whether the *goal is legible* — and `routing` was already a parameter carrying the router's answer. The correct expression was written thirteen lines away in `buildSelectedDecision`.

`shapingQuestions` never reached the caller either, because `run-tool.ts` spreads it only when the decision carries it, and the forced path never set it.

`confidence: 1.0` stays a literal on this path, deliberately: the caller did choose the strategy, so confidence in the choice is total. That is a different claim from whether the goal was clear.
