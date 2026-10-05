---
'nexus-agents': patch
---

MCP `execute_expert` tasks now share per-tool and global concurrency limits with async jobs. Task creation rejects at capacity with the existing busy response and retry hint, and releases its slot when creation fails or background execution settles.
