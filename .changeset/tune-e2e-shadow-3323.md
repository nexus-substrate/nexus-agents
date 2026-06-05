---
'nexus-agents': patch
---

test(routing): full-chain shadow assertion for the self-tuning loop (#3323 criterion 2)

Strengthens the tune-loop e2e proof (the enforce-on producer→store→router
selection-change test already existed, #3324): adds the shadow-mode producer-side
gate assertion — firing a `signal.swarm_unhealthy` through a SHADOW `TuneStage`
records the intended demotion (telemetry `intended++`) but does NOT apply it
(`applied=0`, `effectiveMultiplier=1.0`, routing/rank unchanged). Proves the
`NEXUS_TUNE_ENFORCE` gate sits exactly between record and apply. Satisfies
exit-criterion 2 of #3323.
