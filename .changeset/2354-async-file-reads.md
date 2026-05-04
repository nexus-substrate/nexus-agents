---
'nexus-agents': patch
---

`run_pipeline` and `run_dev_pipeline` no longer block libuv on file reads (#2354).

`resolveTask()` (pipeline-tool.ts) and `resolveTaskInput()` (dev-pipeline-tool.ts) used `fs.readFileSync` inside async MCP request handlers. For multi-megabyte spec/plan files this stalled all in-flight MCP requests for the duration of the read. Both functions are now `async` and use `fs.promises.readFile`. Existing `ENOENT` error message is preserved (caught and rethrown as the same "Spec file not found" / "Plan file not found" string).
