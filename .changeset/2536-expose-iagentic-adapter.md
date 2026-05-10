---
'nexus-agents': patch
---

Expose `IAgenticAdapter` + factory + types from the package root (#2536). The pieces landed in main as part of #2529's PRs but the `exports/agents.ts` re-export wiring was missed, so consumers importing from `'nexus-agents'` couldn't see `createAgenticAdapter`, `AgenticAdapter`, `IAgenticAdapter`, `AgentRunResult`, etc.

Adds explicit re-exports of:

- `AgenticAdapter`, `createAgenticAdapter`
- `AgenticAdapterOptions`, `AgentRunResult`, `AgentStopReason`, `AgentTurn`, `IAgenticAdapter`, `RunAgentArgs`
- `AgenticToolCall` (= `ToolCall` from agentic), `AgenticToolResult` (= `ToolResult` from agentic) — aliased to avoid collision with the existing MCP `ToolCall` / `ToolResult` shapes

Eval-repo v0.3 consumers (aider-polyglot / livecodebench / tau-bench) can now import the agentic primitive directly. Patch bump only — no behaviour change, just visibility fix.
