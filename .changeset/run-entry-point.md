---
'nexus-agents': minor
---

feat(mcp): add `run` — the unified adaptive entry point (read-only)

Adds the `run` MCP tool: give a goal and nexus-agents selects the right strategy (single-shot / dev-pipeline / pipeline / graph-workflow / orchestrate / consensus / spec / research) via the MetaOrchestrator (epic #3548) and returns the routing decision plus the `recommendedTool` to execute it. Read-only in this release — it returns a decision and executes nothing; `forceStrategy` overrides the choice. This is intended to become the default entry point so callers stop hand-picking a pipeline tool; the specialized tools remain available as advanced force-strategy paths. Brings the registered MCP tool count to 46 (counts now derive from `REGISTERED_TOOL_NAMES`, so no count literals were edited). Inline execution via the MetaDispatcher lands in a follow-up.
