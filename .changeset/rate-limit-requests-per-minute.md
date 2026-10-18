---
'nexus-agents': patch
---

Wire `security.rateLimit.requestsPerMinute` to derive the default tool bucket capacity and refill rate in `ToolRateLimiterFactory`.
