---
'nexus-agents': minor
---

feat(cli): `nexus-agents init --portable` command (#2305, child of #2301)

Bootstraps a workspace-local `.nexus-agents/` data directory so docker sandboxes, devcontainers, and CI environments can self-contain runtime state without `~/.nexus-agents` pollution.

```
nexus-agents init --portable                # creates ./.nexus-agents/
nexus-agents init --portable ./.nexus       # custom path
nexus-agents init --portable --force        # overwrite non-empty target
nexus-agents init --portable --dry-run      # preview without writing
nexus-agents init --portable --gitignore    # auto-append to .gitignore (only if .git exists)
```

Idempotent: re-running on an already-initialized directory is a no-op success. Refuses to scaffold in a non-empty non-nexus directory unless `--force`. Restricts `auth/` subdir to mode 0o700.

Pairs with `NEXUS_DATA_DIR` (#2302): `init --portable` scaffolds the directory, then prints the `export NEXUS_DATA_DIR=...` command for the user to activate it. No auto-loading, no walk-up discovery — those remain explicit-deferred per the security design pass on #2301.

Approved scope per consensus_vote 5/1 (contrarian-narrowed): contrarian flagged risk that init might auto-load configs from CWD ancestors, but this implementation creates only — auto-detection is still deferred to the walk-up child.
