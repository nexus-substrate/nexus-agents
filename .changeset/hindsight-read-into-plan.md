---
'nexus-agents': minor
---

feat(pipeline): feed prior hindsight outcomes into plan + vote (#3257)

Hindsight/belief memory was written after every dev-pipeline cycle but never
read back, so the accumulated learning stayed dormant. The pipeline now recalls
prior `HindsightRecord`s for the same task (keyed on the task-stable `taskId`
the write side persists) and prepends a concise, clearly-labeled
"Prior beliefs from past outcomes" block to the research context the architect
and voters see — so plan refinement and voting are informed by what past runs
learned.

Read-only (never mutates belief state), bounded (top 5 most-recent lessons),
and fully opt-in via the existing `beliefMemory` option: pipelines without it
are unchanged. Fire-safe — a recall throw, an `err` Result, or empty recall
injects nothing and planning proceeds normally. The persisted hindsight key was
also made task-stable (was `sessionId ?? task.slice(0,40)`, now always
`task.slice(0,40)`) so learning flows forward across separate runs of the same
work.
