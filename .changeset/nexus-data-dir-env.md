---
'nexus-agents': minor
---

feat(cli): `NEXUS_DATA_DIR` env var for portable / sandbox installs (#2302, child of #2301)

Adds a single resolver `getNexusDataDir()` (in `src/config/nexus-data-dir.ts`) that returns the absolute root of nexus-agents runtime state. Resolution order:

1. `$NEXUS_DATA_DIR` if set + non-empty (resolved against `process.cwd()`)
2. `~/.nexus-agents` (zero-breakage fallback — current behavior)

Refactors 11 source-file callsites that previously hardcoded `homedir() + '.nexus-agents'` (audit, doctor, sessions, model-registry, mobimem, traces, memory, voting correlations, wave checkpoints, MCP auth tokens, research auto-catalog) to derive from the resolver.

`Dockerfile.sandbox` now sets `ENV NEXUS_DATA_DIR=/workspace/.nexus-agents` so a mounted workspace owns its own state — memory/learning/audit no longer leak across sandbox runs into the container's `$HOME`.

Approved scope per consensus_vote 5/1 (contrarian-narrowed): explicitly does NOT include git-style ancestor walk-up discovery (CVE-2022-24765 risk class) or a `nexus-agents init --portable` command. Those are deferred to separate children of #2301 with a security design pass.

Zero behavior change when env var is unset.
