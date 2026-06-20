---
'nexus-agents': minor
---

MCP server now resolves the active workspace root from the client's declared
`roots` (MCP standard) so per-repo `.nexus-agents/` state lands in the repo
being worked on (#3991).

A globally-installed MCP server runs with `process.cwd()` outside the project,
so the per-repo data resolver previously routed governance vote-records,
checkpoints, audit, and session state to `~/.nexus-agents/` instead of
`<repo>/.nexus-agents/`. The server now asks the client for its workspace
`roots` after the initialize handshake and bases per-repo subdirs there via a
new `setActiveWorkspaceRoot()` resolver hook. The client-supplied path is
canonicalized and validated (absolute, existing directory) before use.

Purely additive and standards-based — no new env var. Clients that don't
declare the `roots` capability keep the existing `findRepoRoot(cwd)` → homedir
fallback, so CLI and in-repo callers are unchanged.
