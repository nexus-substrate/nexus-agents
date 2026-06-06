---
'nexus-agents': patch
---

chore(mcp): derive MCP tool counts from REGISTERED_TOOL_NAMES.length

Removes the hardcoded `45` tool-count literal from the test suite so adding or removing a tool no longer requires bumping a number in multiple files. `mcp/tools/index.test.ts` and `tool-annotations.test.ts` now cross-check their registries against `REGISTERED_TOOL_NAMES.length`; the redundant count assertion in `cli-server-tools.test.ts` (which asserted the canonical list's own length — a tautology) is replaced with structural invariants (unique, non-empty names). Also corrects the stale "all 20 registered MCP tools" comment on `TOOL_TIER_MAP`. Phase 1 of the tool-registry centralization epic (#3563).
