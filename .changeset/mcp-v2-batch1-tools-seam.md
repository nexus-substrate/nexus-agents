---
'nexus-agents': patch
---

Batch 1 of MCP split v2 SDK migration (Epic #4485): introduce internal SDK type seam `src/mcp/sdk-types.ts` and retarget all 67 tools in `src/mcp/tools/` from `@modelcontextprotocol/sdk/server/mcp.js` to `../sdk-types.js`.
