---
'nexus-agents': minor
---

feat(context): surface prior research in UnifiedContext (#3148)

Closes the research→context half of the knowledge loop. The research registry
accumulated findings, but `ContextRetriever` (the canonical pre-task read used by
`orchestrate` and graph workflows) had no field for them, so planners couldn't
reuse research. `getContextForTask` now returns `researchInsights` — research
techniques whose name/topic is relevant to the task, with their status
(implemented / rejected / planned) — and `summarizeContextForPrompt` renders a
"Prior research on this topic" block into the planner prompt. The read is
fail-soft (missing/failed registry → no insights, context assembly never
breaks) and uses the lightweight registry status read, not full synthesis, so
it stays cheap on the per-task fan-out.
