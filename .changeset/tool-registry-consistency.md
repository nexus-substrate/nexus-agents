---
'nexus-agents': patch
---

test(mcp): consolidated tool-registry consistency guard

Adds a single audit test asserting every MCP-tool-keyed parallel registry stays in sync with the canonical `REGISTERED_TOOL_NAMES`: `TOOL_ANNOTATIONS` must cover exactly the registered tools (complete), while the intentional-subset registries (`TOOL_PREREQUISITES`, `NO_PREREQUISITE`, `tool-risk` `READ_ONLY_TOOLS`, `TOOL_TIER_MAP`) may omit tools but must contain no orphan keys (a dangling entry for a removed/renamed tool now fails CI with a message naming the registry). `policy-rules.ts` `READ_ONLY_TOOLS` is deliberately excluded — it is a different vocabulary (generic agent/filesystem tools, not MCP tool names). Phase 2 of the tool-registry centralization epic (#3563).
