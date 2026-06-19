---
'nexus-agents': patch
---

fix(cli): proactive first-run setup hint across all commands (#3208)

The first-run setup hint previously fired only during `server` mode, so CLI
tooling users who run verification/inspection commands never saw it. It now
fires from the CLI dispatch seam on the first invocation of ANY command except
`version`/`help` (and their `-v`/`-h`/`--version`/`--help` flag forms, which
resolve to those commands) and `setup` itself.

The hint is marker-gated (`~/.nexus-agents/.first-run-done`, resolved via the
existing `nexusSharedPath` per-user data-dir helper), best-effort on write
(read-only FS / perms failures still show the hint once and never crash or
block), stderr-only (never pollutes piped/scripted stdout or JSON), and
TTY-gated so a first run in CI/pipes emits nothing and does not consume the
marker — the operator's first interactive run still gets the hint. Exit codes,
ordering, and stdout are unchanged; the hint is purely additive.
