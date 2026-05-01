---
'nexus-agents': minor
---

feat(cli): `init --portable --mcp-config` flag for workspace-local MCP wiring (#2308, child of #2301)

Adds an opt-in `--mcp-config` flag on `nexus-agents init --portable` that emits a Claude Code repo-local `.mcp.json` at the workspace root. The server entry pins `NEXUS_DATA_DIR` to the absolute path of the workspace's `.nexus-agents/` directory so the harness uses workspace-local state.

```bash
nexus-agents init --portable --mcp-config
# → creates ./.nexus-agents/, writes ./.mcp.json, auto-gitignores .mcp.json
```

Behavior:

- Idempotent: matching entry is a no-op success
- Merges with existing `.mcp.json` (preserves other server entries)
- Refuses to overwrite differing `nexus-agents` entry without `--force`
- ALWAYS auto-appends `.mcp.json` to `.gitignore` when a `.git` dir is present (per the contrarian-narrowed scope review — absolute paths in committed config break for collaborators)
- Post-install message includes a "per-machine; do not commit" caveat when written

**Bug fix bundled:** the v2.61.0 `init --portable` ship also exposes a wiring bug — `--portable` and `--gitignore` flags were declared in the parser config but never passed through `buildOptions()`, so they were always undefined at runtime. This release adds `buildInitOptions()` and routes all three flags (`portable`, `gitignore`, `mcp-config`) through it.

Approved scope per consensus_vote 5/1 (contrarian-narrowed). Other harness formats (OpenCode, Codex) and portable npm install path remain deferred to separate children of #2301.
