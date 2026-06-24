---
'nexus-agents': patch
---

Fix consensus voters deadlocking when the spawned CLI auto-loads the nexus-agents MCP server ([#4033](https://github.com/nexus-substrate/nexus-agents/issues/4033))

When a `cli-first` consensus voter shelled out to a coding CLI (e.g. `opencode run
--format json`) and that CLI was itself configured to auto-start a `nexus-agents
--mode=server` MCP server, every voter subprocess launched a _fresh nested_ nexus-agents
server. The nested server attached to the child's stdio and blocked the child's own MCP
handshake, so the voter never returned its JSON and `consensus_vote` deadlocked (the whole
process tree sat at 0% CPU until the per-voter timeout reaped it minutes later).

`subprocess-env.buildChildEnv` now stamps an incrementing `NEXUS_SUBPROCESS_DEPTH` marker
on every spawned-CLI child (it is `NEXUS_`-prefixed, so it survives the env allowlist and
reaches the grandchild server). The server bootstrap reads the marker at the top of startup
and, when nested, exits cleanly _before_ any slow initialization — so the parent CLI
proceeds without that MCP server (it needs no nexus server to answer a prompt). The guard
is scoped to `--mode=server` (orchestrator mode is unaffected) and never fires for a
top-level launch.

Scope: this covers the subprocess (opencode/claude/gemini/codex-CLI) voter path. The
codex-**MCP** topology (`codex mcp-server` spawned over a replaced env) keeps its own
independent `NEXUS_MCP_DEPTH` recursion guard (#3350) — the two markers are distinct and
do not interfere.
