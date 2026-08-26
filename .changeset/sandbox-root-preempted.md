---
'nexus-agents': patch
---

fix(config): honor NEXUS_SANDBOX_ROOT instead of defaulting to cwd

`NEXUS_SANDBOX` is itself one of `SANDBOX_ENV_VARS`, so setting it made the
`container-env` heuristic fire and stamp `NEXUS_DATA_DIR = <cwd>/.nexus-agents`
during CLI bootstrap. Every later `getNexusDataDir()` then took the
`NEXUS_DATA_DIR` branch and returned before reaching its own sandbox branch —
the one that resolves `NEXUS_SANDBOX_ROOT`.

So the documented purpose of `NEXUS_SANDBOX_ROOT` ("default `NEXUS_DATA_DIR` to
the multi-repo root") never happened from any entry point going through
`cli.ts`, which is the CLI and `--mode=server`. In a multi-repo mount that
silently fragmented audit-chain, vote-record and job state per working
directory — the layout `doctor`'s `dataDirInsideRepo` check exists to detect and
reports as operator misconfiguration.

The heuristic now uses the declared root as the data-dir base when one is set,
and falls back to cwd when it is not.
