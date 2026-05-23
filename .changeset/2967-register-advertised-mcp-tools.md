---
'nexus-agents': patch
---

**fix(mcp):** register `pr_review` and `supply_chain_tradeoff_panel` MCP tools; sync `REGISTERED_TOOLS` allowlist with the actual STANDALONE_TOOLS table. Closes #2967.

Two MCP tools were advertised in `server.json`, `README.md`, `docs/ENTRYPOINTS.md`, and shipped tool-annotations + tool-prerequisites — but never registered with the MCP server. Any client calling `tools/call { name: "pr_review", ... }` or `{ name: "supply_chain_tradeoff_panel", ... }` got `MethodNotFound`. The README v5 evaluation results for `pr_review` (100% bug-catch on 10 PRs) referred to a tool no MCP client could reach.

Root cause: `mcp/tools/index.ts` `REGISTERED_TOOL_NAMES` (the source `inject-governance.ts` uses to write `server.json`) listed both tools, but the actual registration path in `cli-server-tools.ts` (`STANDALONE_TOOLS` table + `REGISTERED_TOOLS` audit allowlist) had drifted behind. The lockstep promised in the comment at `mcp/tools/index.ts:497-500` was only between `REGISTERED_TOOL_NAMES` and `server.json` — not between what was advertised and what was actually wired.

Fix:

- Added `registerPrReviewTool` + `registerSupplyChainTradeoffPanelTool` to the `STANDALONE_TOOLS` table in `cli-server-tools.ts`.
- Re-exported `registerSupplyChainTradeoffPanelTool` from `mcp/index.ts` (the barrel `cli-server-tools.ts` imports from). `registerPrReviewTool` was already re-exported.
- Synced `REGISTERED_TOOLS` allowlist (28 → 38 entries) with the actual set registered via `STANDALONE_TOOLS` + category helpers. Adds the 10 names that had drifted: `pr_review`, `supply_chain_tradeoff_panel`, `research_add_source`, `research_synthesize`, `query_task_state`, `verify_audit_chain`, `extract_symbols`, `search_codebase`, `run_dev_pipeline`, `run_pipeline`. This fixes the `logToolRegistration` audit log lying about which tools are blocked when an operator configures `securityConfig.toolAllowlist`.
- Updated `cli-server-tools.test.ts` to mock the 2 new register functions and assert `REGISTERED_TOOLS.length === 38` against the new expected list.

Behavior change: clients can now `tools/list` the 2 tools and call them. No effect on existing tools.
