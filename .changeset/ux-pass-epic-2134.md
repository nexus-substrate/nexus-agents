---
'nexus-agents': minor
---

UX pass (epic #2134): first-run experience tightening.

- `nexus-agents --help` now hides 18 maintainer-audience commands (benchmarks, release tooling, deep diagnostics) by default and groups the remaining 19 into **Essential** + **Advanced** tiers. Run `nexus-agents --help --all` to see the full surface. Progressive disclosure instead of a 37-command wall on first install. (#2135 → #2139)
- `nexus-agents verify` now actually verifies the things that break during installation: better-sqlite3 native module loadability, `~/.nexus-agents/` data-dir writability, and adapter availability (API keys or CLI binaries). New `severity: 'hard' | 'warn'` classification: warnings (no API keys, missing better-sqlite3) print yellow ⚠ but exit 0; only real breakage (Node too old, broken exports) exits 1. (#2136)
- `nexus-agents setup` runs the new verify checks inline at the end with copy-pasteable remediation text, so install-time issues surface where the user just ran setup instead of requiring a separate `doctor` invocation. Skipped in `--dry-run`. Exit code contract: warnings don't fail setup. (#2137)
- `nexus-agents setup` also prints a 3-line "Getting started" banner with the next commands to try. Step 2 adapts based on whether MCP was wired up (`Use through Claude Code` if yes, `nexus-agents orchestrate` if no). (#2138)

All four children shipped via PRs #2139 and #2140 (stacked-squash merge).
