---
'nexus-agents': patch
---

fix(mcp): break the `ci-health-check-tool` ↔ `ci-health-log` circular import (#3756). Importing the MCP tools barrel (or either ci-health module) under tsx ESM evaluation threw `ReferenceError: Cannot access 'CiHealthStatusSchema' before initialization` — the tool defined the shared schema/types AND imported the log's appenders, while the log used the schema at module-eval time, so the cyclic init order left it in the TDZ. Extracted `CiHealthStatusSchema`/`CiHealthStatus`/`CiHealthSignal` into a leaf `ci-health-types.ts` (imports only zod) that both modules depend on; the tool re-exports them for API compatibility. A structural guard test keeps the cycle edge from returning.
