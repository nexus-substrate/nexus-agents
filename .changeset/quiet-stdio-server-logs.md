---
'nexus-agents': patch
---

Keep MCP server stdout reserved for JSON-RPC by redirecting `logging.destination: stdout` to stderr in stdio server mode. Emit one warning explaining the redirect, even when the configured log level is error. CLI logging continues to support stdout.
