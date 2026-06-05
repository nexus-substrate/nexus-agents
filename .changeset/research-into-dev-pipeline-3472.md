---
'nexus-agents': minor
---

feat(pipeline): surface prior research to dev-pipeline plan/vote (#3472)

Completes the research→context loop. #3148 wired research insights into
`getContextForTask` (orchestrate + graph workflows); this brings the same signal
to the multi-agent dev-pipeline, which assembles its own research context.
`runPlanningPhase` now prepends a bounded, labeled "Prior research on related
topics" block — technique name + status + topic — to the plan/vote context,
complementing the #3257 hindsight block (hindsight = what happened on similar
work; research = what we already investigated and decided, including rejected
approaches). Always-on and fail-soft (registry read failure → no block); each
field is whitespace-collapsed + length-capped so a poisoned registry value can't
escape the data-framing. The former private `fetchResearchInsights` is now an
exported `getResearchInsightsForTask` for reuse.
