---
'nexus-agents': major
---

Remove the deprecated MCP `mode: 'sync' | 'async'` alias from `consensus_vote`, `run_workflow`, and `orchestrate`. Use `dispatch: 'sync' | 'async'` instead; omitting it still runs synchronously. Calls containing the removed alias now fail validation with an error naming `dispatch`. `run_dev_pipeline` continues to accept its execution `mode: 'autonomous' | 'harness'`.
