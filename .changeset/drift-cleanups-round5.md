---
'nexus-agents': patch
---

Drift cleanups — round 5 of the #2720 umbrella ([#2724](https://github.com/williamzujkowski/nexus-agents/issues/2724)).

**Stop `delegate_to_model` from writing synthetic `success: true` outcomes to the OutcomeStore.** The tool returns a routing recommendation — it does NOT execute the task — but `recordToOutcomeStore` unconditionally appended `{success: true, source: 'delegate'}` per invocation. Those synthetic rows fed the routing-feedback loop (`weather_report.byCategory`, `recommendedMappings`, LinUCB, TOPSIS, fitness-audit) as if real evidence, biasing future routing toward whatever was last recommended.

Audit of `~/.nexus-agents/learning/outcomes.jsonl` found ~3993 `source: 'delegate'` rows total; a large fraction of the `success: true` ones were from this synthetic path (the other 9 `source: 'delegate'` writers — orchestrate, agent-executor, parallel-exploration, triangulated-review, feedback-subscriber, adaptive-orchestrator, consensus-plan, run-graph-workflow, orchestrate-dispatch — record REAL execution outcomes and are unchanged).

Fix: delete `recordToOutcomeStore`; `recordDelegation` now only writes to the tool-memory "learned pattern" trail (which is the recommendation log, not the routing-evidence stream). The `source: 'delegate'` field is now exclusively populated by real-execution writers.
