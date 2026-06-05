---
'nexus-agents': patch
---

fix(docops): restore silently-broken tool-prerequisite coverage gate (#3444)

`checkToolPrerequisites` (the #2652 CI gate ensuring every non-read-only MCP tool
declares a deliberate prerequisite decision) read the wrong annotations file after
the #3358 move — `src/mcp/tool-annotations.ts` (a wrapper with no annotation
blocks) instead of `src/mcp/tools/tool-annotations.ts` — so its non-read-only set
was always empty and the gate could never fail. Point it at the real map; the gate
passes on current code (maps were maintained, only enforcement was broken). Two
gate-meta-tests with the same stale path are corrected so they actually exercise
the gate.
