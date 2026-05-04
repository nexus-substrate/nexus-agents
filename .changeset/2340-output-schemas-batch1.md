---
'nexus-agents': patch
---

Add `outputSchema` to `research_query` + `research_add` MCP tools (#2340 batch 1).

Per the audit (#2337), 11 MCP tools (research*\*, memory*\*, plus a few others) lacked `outputSchema` while `consensus_vote` already had `CONSENSUS_VOTE_OUTPUT_SCHEMA`. MCP clients that respect output schemas (Claude Desktop, MCP Inspector, structured-pipeline frameworks) couldn't validate response shapes for the unschemaed tools.

This PR migrates the first two:

- `research_query` — envelope schema `{ action: string, success: boolean, data: unknown }`. Inner `data` is `z.unknown()` because the four action variants (status/overlap/stats/search) return different shapes; per-action schemas deferred.
- `research_add` — concrete schema `{ success, paperId?, title?, message, dryRun? }` matching `executeResearchAdd`'s actual return type.

Both handlers switched from `toolSuccess(JSON.stringify(...))` to `toolSuccessStructured(...)` so the SDK has `structuredContent` to validate against the schema.

Remaining tools tracked in #2340 for follow-up batches.
