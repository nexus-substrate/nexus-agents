---
'nexus-agents': patch
---

fix(mcp): correct 5 inaccurate tool descriptions (JSDoc audit Phase 2b)

Removes false/overstated claims from registered MCP tool descriptions (consumer-facing):
run_graph_workflow advertised "rollback" (no rollback exists — only checkpoints/events/audit);
execute_expert promised "confidence" (not in the response); list_experts promised "default model"
(not returned); list_workflows promised "required inputs" (returns name/version/description/category);
ci_health_check claimed "idempotent / no state mutated" (appends a local telemetry event per call).
Fixed in both the tool files and scripts/tool-descriptions-data.ts (the docs source), and regenerated
ENTRYPOINTS/README/capabilities. #3516 / #3520.
