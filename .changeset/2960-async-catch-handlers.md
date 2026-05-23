---
'nexus-agents': patch
---

**fix(async):** add `.catch` to two fire-and-forget Promises. Closes #2960.

Two `void`-discarded async calls could reject without a handler — silent in default Node mode, crash in `--unhandled-rejections=strict`:

- `cli-server-tools.ts:664` `void initUpstreamServers(...)` — upstream MCP server init failure was a silent diagnostic loss.
- `mcp/tools/delegate-to-model.ts:159` `void executeDelegatePipeline(...)` — exact pattern of the sibling at `mcp/tools/orchestrate.ts:822-826` but missing the `.catch` the precedent uses.

Both now `.catch` and log; behavior on success is unchanged. Mirrors the established resilience pattern in the codebase.
