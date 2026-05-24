---
'nexus-agents': patch
---

**fix(pipeline):** cleanup the cached MCP-config tempdir on shutdown. Closes #2946.

`expert-bridge.getMcpConfigPath` cached the path returned by `generateMcpConfig` but threw away the `cleanup` function that came with it, so the parent `mkdtemp` (`<tmpdir>/nexus-mcp-XXXXXX/`) accumulated one entry per daemon lifetime. Per-process not per-call (caching limits the blast radius), but stale tempdirs piled up across `nexus-agents --mode=server` restarts.

Fix: store the cleanup alongside the cached path; expose `shutdownExpertBridge()`; wire it into `cli-server.ts:createShutdownCleanup` next to `shutdownToolMemory()`. Cleanup is idempotent, never throws (failures log + swallow).

89 tests pass across the affected test files (cli-server, agent-executor, pipeline-eval-edge, research-trigger); tsc + eslint clean.
