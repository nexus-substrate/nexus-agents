---
'nexus-agents': patch
---

Restore public-API parity for the MCP barrel (`exports/mcp.ts`, #3199): the memory tools' response types (`MemoryQueryResponse`, `MemoryStatsResponse`, `MemoryWriteResponse`) and the async-job + improvement-review tools (`get_job_result` / `list_jobs` / `cancel_job` / `improvement_review` — their `register*Tool`, input schemas, and `*Response`/`*Input`/`*Deps` types) were exported from the internal `mcp/index.ts` but missing from the public package barrel, so embedders had to re-declare them. All are now re-exported. Additive, no behavior change.
