---
'nexus-agents': patch
---

Prevent Codex MCP tasks from silently running in the server's working directory when a task specifies another directory. These tasks now return a non-retryable refusal because MCP working-directory support cannot be verified. Use the Codex subprocess transport for directory-bound tasks. Tasks without a working directory retain their existing behavior.
