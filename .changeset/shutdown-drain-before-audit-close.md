---
'nexus-agents': patch
---

Server-mode shutdown no longer loses audit records at the end of a session (#6573).

- **Audit logger closes last.** Shutdown now closes the MCP server first, waits up to 1 s for running tool calls to finish, runs the rest of the teardown, and only then closes the audit logger. Before, the logger closed first, so a tool call that finished during shutdown lost its audit event ("Attempted to log after close"). `system.shutdown.begin` now carries `metadata.toolCallsStillRunning`, the number of calls still running when the logger closed, so a missing event is visible on the record. Task-based tools and async jobs are not waited for.
- **A closed stderr pipe no longer crashes shutdown.** When the host process dies, the server's first write to its stderr pipe fails with EPIPE. That error used to become an uncaught exception, and the process exited with code 1 before the audit flush, so `system.shutdown.begin` was never written. An EPIPE on stderr now requests the normal graceful shutdown. Other stderr errors still end the process.
