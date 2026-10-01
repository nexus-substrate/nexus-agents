---
'nexus-agents': minor
---

Link dev-pipeline stage outcomes to their `pipeline-<sessionId>` run trace: outcome rows now carry the same run id the trace is written under. Stages without a reachable session, or whose run id would exceed the 128-character trace id limit, leave `traceId` absent and stay unmatched instead of being lost on reload. A coverage report for pipeline joins is tracked separately (#6867).

Add optional `jobId` metadata to decision cost records for asynchronous consensus votes and PR reviews, preserving the separate decision ID. Synchronous and legacy records omit the field; malformed persisted job IDs drop only that metadata and retain the cost row.
