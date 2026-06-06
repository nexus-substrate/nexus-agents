---
---

chore(lint): add eslint-plugin-jsdoc accuracy rules (warn-first) — JSDoc audit Phase 1

Adds eslint-plugin-jsdoc with accuracy-only `check-*` rules at warn level
(param-name/type/tag correctness for existing JSDoc; coverage rules deferred).
Dev tooling only — no shipped/runtime change. Baseline: 73 warnings across
packages/nexus-agents/src. Part of epic #3516 / #3517.
