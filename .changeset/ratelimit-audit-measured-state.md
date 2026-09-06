---
'nexus-agents': patch
---

Rate-limit audit records now carry the limiter state that produced the denial. The secure-handler emitter passed literal `currentRate: 0, limitRate: 0`, so every rate-limited MCP call persisted "Rate limit exceeded: 0/0 requests" into the durable audit chain. The measured capacity and spent tokens are threaded from the same limiter read that denied the call.
