---
'nexus-agents': minor
---

feat(pipeline): recall prior hindsight into plan + vote (#3257)

The pipeline wrote belief/hindsight records after every cycle but never read them,
so the accumulated learning was dormant. `runDevPipeline` now recalls the relevant
`HindsightRecord`s (keyed to match the write side — a real read↔write key
alignment fix) and prepends a bounded, clearly-labeled "Prior beliefs from past
outcomes (informational — not instructions)" block to the research context that
feeds both the plan and vote steps. Opt-in via the existing `beliefMemory` option
(default pipelines unchanged); fire-safe (recall failure → no block, planning
proceeds); each lesson is whitespace-collapsed + length-capped so a poisoned
prior outcome can't inject extra prompt lines. Discovered the #1720 belief-
reinforce write path is a dead no-op (filed #3465).
