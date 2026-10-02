---
'nexus-agents': patch
---

Make `doctor --live` report completion latency, actionable error classes, and sanitized failure messages. Bound each probe using the central timeout and signal cancellation at its deadline, disable retries, and avoid a duplicate Claude completion. Unconfigured adapters are explicitly skipped; any failed live completion exits nonzero. Plain `doctor` continues to make no model calls.
