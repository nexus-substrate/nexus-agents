---
'nexus-agents': patch
---

feat(capability-loop): quantified shadow→enforce exit criterion (#3612)

Condition 1 of the #3540 auto-invoke gate. `evaluateEnforceReadiness` defines a
FALSIFIABLE numeric gate for promoting auto-remediation from shadow (#3611) to
enforce (#3618), replacing the unfalsifiable "shows sound selection". Mirrors the
tune-loop's explicit exit criteria (#3323): five independently-checkable
conditions, ALL required (fail-closed):

- **volume** — ≥ minShadowSelections observed,
- **judged-coverage** — ≥ minJudgedRate reviewed,
- **soundness** — ≥ minSoundnessRate of reviewed judged sound (fails closed on zero reviews),
- **named-evaluator** and **named-owner** sign-off.

Pure evaluation; flips no flag. The enforce path (#3618) refuses to enable
enforcement unless `ready` is true.
