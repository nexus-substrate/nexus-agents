---
'nexus-agents': major
---

Return `RateLimitStats.lastHitAt` and `weather_report.rateLimits[].lastHitAt` as ISO-8601 strings instead of epoch milliseconds. Callers that need epoch milliseconds should use `new Date(lastHitAt).getTime()`.

Narrow `AgentVoteSummary.rejectionCategories` from arbitrary strings to the supported `RejectionCategory` values. Callers constructing vote summaries must use those categories. The `consensus_vote` success response now uses the schema-typed structured output helper to catch type/schema drift during compilation.
