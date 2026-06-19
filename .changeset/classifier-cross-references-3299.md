---
'nexus-agents': patch
---

docs(task-analysis): cross-reference the 5 intentionally-separate task classifiers (#3299)

Add standardized module doc-comment cross-references to the 5 task
classifiers (shared-task-analyzer, task-type-classifier,
cli-adapters/task-classifier, coordination/task-features, and
pipeline/adaptive-orchestrator's `classifyTask`). #3299 resolved to "by
design, not duplication": the classifiers have incompatible output enums and
drive distinct routing decisions, so their superficial keyword overlap does
not warrant consolidation. The cross-references durably document this so
future consolidation audits don't re-flag it. Doc-comments only — no logic,
type, or behavior change.
