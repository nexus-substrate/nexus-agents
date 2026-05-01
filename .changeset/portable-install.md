---
'nexus-agents': minor
---

feat(cli): `init --portable --install` / `--uninstall` for fully workspace-local nexus-agents (#2311, child of #2301)

Closes the binary half of "install everything inside one folder at the workspace level." Pairs with v2.60.0's `NEXUS_DATA_DIR` (state) and v2.62.0's `--mcp-config` (harness wiring) — this release adds the binary itself.

```bash
# Full workspace-local install
nexus-agents init --portable --install --mcp-config
# Creates ./.nexus-agents/{cli,bin,memory,audit,...} + ./.mcp.json
# .mcp.json's command points at .nexus-agents/bin/nexus-agents (absolute path)

# Tear down
nexus-agents init --portable --uninstall
# Removes cli/ and bin/, preserves data subdirs
```

Implementation:

- `src/cli/portable-installer.ts` — `installPortable()` runs `npm install nexus-agents@<version>` into `.nexus-agents/cli/`. Uninstall removes `cli/` and `bin/`, preserves `memory/`/`audit/`/etc.
- `src/cli/bin-shim.ts` — emits a Node script at `.nexus-agents/bin/nexus-agents` that imports the local CLI entry; `chmod +x`; idempotent.
- Wired into `init-portable.ts`: `initPortable()` is now async (necessary for the npm spawn).
- `mcp-config-emitter.ts` accepts an optional `commandPath` — when present (i.e. when `--install` ran first), the emitted `.mcp.json` points the server entry at the absolute shim path instead of bare `nexus-agents`.

Contrarian-narrowed scope (#2311 vote, 5/1):

- **Version pin = current version.** The contrarian flagged that `npm install nexus-agents` (no version) silently pulls `latest`, which mismatches the executing CLI. Adopted: default install pins to the running `VERSION` constant. Refuses to install if `VERSION === 'dev'` (unpublished).
- **Mutual exclusion:** `--install` and `--uninstall` cannot be combined.
- **Network failure cleanup:** if `npm install` fails, the partially-created `.nexus-agents/cli/` is removed before returning the error.
- **Subprocess safety:** uses `execFile` (not `exec`) with literal package name and version-as-arg — no shell interpolation, no command-injection surface.
- **Disk usage warning:** post-install message states the install is sizable (~390MB).

Out of scope (deferred to follow-up children of #2301):

- `--update` flag (Child #3b) — adds version-tracking complexity (npm registry query, lockfile drift, bin shim regen on entry-point changes).
- Windows `.cmd` wrapper for the bin shim (Child #3c if needed) — Unix shebang only this iteration.
- Pinning a specific version via `--version=X.Y.Z` flag.
- `Dockerfile.sandbox` integration with the portable install path.

`init --portable` flag count: 6 — `--force`, `--dry-run`, `--gitignore`, `--mcp-config`, `--install`, `--uninstall`. The first 4 ship state + config; `--install`/`--uninstall` ship the binary.
