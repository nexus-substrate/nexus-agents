---
'nexus-agents': minor
---

Fix `orchestrate` reporting success for simple tasks that were never executed. The simple-task shortcut now returns `executed: false` and records no orchestration or router outcome, preventing analysis-only responses from inflating routing success metrics. Task selection and normal execution behavior are unchanged.
