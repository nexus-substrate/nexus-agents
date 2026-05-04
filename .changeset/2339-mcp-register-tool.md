---
'nexus-agents': patch
---

Standardize MCP tool registration on `server.registerTool()` (#2339).

`run_dev_pipeline` and `run_pipeline` were the only two of 34 MCP tools still using the older `server.tool(name, schema, handler)` API. The other 32 use `server.registerTool(name, { description, inputSchema, ... }, handler)`. Migrated both so MCP clients see consistent metadata for every tool, and the `eslint-disable @typescript-eslint/no-deprecated` workarounds are gone.

No client-visible behavior change beyond the tool descriptions now being available in MCP listings (they previously weren't).
