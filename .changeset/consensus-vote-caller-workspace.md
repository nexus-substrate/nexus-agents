---
'nexus-agents': minor
---

`consensus_vote` accepts a caller-supplied `workspace`: a panel run by a shared MCP server now reviews the repository the caller names instead of the server's process cwd, and `artifactPath` is bounded by that same root. The path must exist, be a directory and sit inside a git repository; its repository root is used, and an unusable path fails as a validation error before any seat runs (#7751).
