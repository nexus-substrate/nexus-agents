---
'nexus-agents': patch
---

`TaskContract.analysis` is now derived from the task instead of asserted (#5924).
`orchestrate` recorded every task as
`{ complexity: 'high', taskType: 'orchestration', ambiguityScore: 0.3 }` and
`delegate_to_model` every task as
`{ complexity: 'moderate', taskType: 'routing', ambiguityScore: 0.1 }` — a fixed
score no task could move. Both entry points now call `SharedTaskAnalyzer`, which
CLAUDE.md already names canonical for this and which produces exactly these three
fields synchronously.
