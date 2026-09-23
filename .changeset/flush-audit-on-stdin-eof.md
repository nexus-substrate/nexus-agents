---
'nexus-agents': patch
---

Server mode now flushes the audit log when the MCP host closes stdin (#6560).

Closing stdin is how stdio MCP hosts normally stop a server. That path used to call `process.exit(0)` directly, skipping the shutdown cleanup that SIGINT and SIGTERM run. Audit records queued since the last 1 s flush were lost: a session shorter than one second left an empty audit file, and `system.shutdown.begin` was never written, so a normal stop looked the same as a crash. Tool-memory persistence and the rest of the teardown were skipped too.

Parent death (stdin end, stdin close, or a parent-pid change) now goes through the same cleanup as the signals. That cleanup runs once even when a signal and stdin EOF arrive together. It is bounded at 12 s so a hung flush cannot keep an orphaned server alive; if the bound fires, the server logs an error and exits with code 2 (`SHUTDOWN_ERROR`). A clean stop still exits 0.
