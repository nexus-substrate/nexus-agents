---
'nexus-agents': minor
---

feat(capability-loop): improvement-signal → remediation-task bridge (#3540 inc.1)

First, safe increment of the capability loop (#3540): a pure
`improvementSignalsToTasks()` mapper turns the observability signals
`improvement_review` already detects (fitness decline, CLI-floor, failure-category
concentration, consensus rejection, self-eval) into structured remediation
PipelineTasks, surfaced on the `improvement_review` response as `remediationTasks`.
SUGGEST-ONLY by construction — a pure mapping that executes nothing, files
nothing, and auto-invokes no pipeline; a reviewer decides whether to route a task
through the dev-pipeline. The safety-critical auto-invoke gate is a deliberately
separate, owner-gated later increment.
