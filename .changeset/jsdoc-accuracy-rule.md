---
---

docs(rules): add .rules/jsdoc-accuracy.md — regression prevention for the JSDoc audit (#3521)

Codifies the JSDoc-audit lessons as a load-bearing rule (auto-loaded, cross-adapter
via the governance rules table, 19→20): docs describe actual behavior (gated at error
by eslint-plugin-jsdoc); behavior-changing fixes sweep the surrounding docs + both
description sources; build-vs-drop on capability-revealing drift (don't reflexively
delete intent); verify doc-vs-code findings against the code before acting; avoid
drift-prone line/symbol citations. Docs-only. Epic #3516 Phase 3.
