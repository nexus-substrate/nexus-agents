---
'nexus-agents': patch
---

refactor(mcp): collapse duplicate MCP `ToolResult` declarations onto the canonical type (#5129 item 6)

The wildcard half of #5129 item 6 (`export *` in `core/index.ts`) landed in #6474. This finishes the duplicate half for the MCP layer:

- `mcp/middleware/middleware-chain.ts` and `mcp/tools/delegate-to-model-types.ts` now re-export `ToolResult` from `mcp/tools/tool-result.ts` instead of redeclaring it. The delegate copy had already drifted: it lacked the `_meta` error-envelope field (#2649). Adopting the canonical type only adds that optional field.
- New `tool-result-identity.test.ts` checks type identity at compile time and that no second declaration exists in the source. It was mutation-checked: putting the drifted copy back fails both vitest and `tsc`.
- Two definitions stay separate on purpose because they are different shapes in different layers: `core/types/tool.ts` (`ToolContentBlock[]`, `structuredContent: unknown`; `core/` cannot import `mcp/`) and `agents/agentic/types.ts` (the agent loop's `{ content: string }` tool_result).
