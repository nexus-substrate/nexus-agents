---
'nexus-agents': patch
---

Fix state overwrite in `ForestEngine.processStep` and eliminate vacuous assertions in `forest-engine`, `agent-expert-system`, and `agent-skill-library` tests (#6456). Preserves expanded and completed nodes in reasoning forest trees, and verifies real compositions and expert query results.
