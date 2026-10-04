---
'nexus-agents': patch
---

dependency: MCP SDK 1.32.0. Scope in-memory MCP tasks to the session that created them when callers supply a session ID, preventing other sessions from reading or changing those tasks. Calls without a session ID remain unrestricted. Accept tool and prompt requests that omit optional arguments (#7045).
