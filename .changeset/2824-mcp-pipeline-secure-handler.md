---
'nexus-agents': patch
---

**fix(mcp):** route `run_pipeline` / `run_dev_pipeline` through the standard secure-handler chain. Part of #2824 (audit P1).

Both pipeline tools registered a bare `server.registerTool()` callback, bypassing the `createSecureHandler → wrapToolWithTimeout → toSdkCallback` chain every other MCP tool uses. Consequences: no rate-limiting, no abort-signal or progress-token plumbing (the very tools that need it most, being long-running), and `schema.parse(args)` ran outside any try/catch — so a `ZodError` on bad input surfaced as a raw JSON-RPC `-32603` internal error instead of a structured `validation` envelope.

Both tools now use the standard chain: input is validated with `safeParse` inside the handler and a bad payload returns a `toolStructuredError({ errorCategory: 'validation' })`. `run_pipeline` and `run_dev_pipeline` are added to `MCP_TIMEOUTS.perTool` at 15 min so the newly-applied `wrapToolWithTimeout` does not kill these multi-stage pipelines at the 60s default.
