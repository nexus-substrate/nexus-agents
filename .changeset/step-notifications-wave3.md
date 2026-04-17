---
'nexus-agents': patch
---

feat(mcp,graph): wire step notifications into execute-expert + graph-hooks

Third wave of step-notification migrations. Operators now see:

- `expert:code_expert` / `expert:security_expert` etc. during expert
  execution with summary like `"code_expert ok"` or `"security_expert failed"`
- `hook:precondition:nodeId` / `hook:verify:nodeId` during graph workflow
  hook execution with summary like `"precondition passed"` or `"verify failed: ..."`
