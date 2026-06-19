---
'nexus-agents': patch
---

test(scripts): make `inject-governance.test.ts` parallel-safe + CI-collected (#3954)

The governance-injection test was excluded from the root `vitest.config.ts`: it
spawned ~30 `npx tsx scripts/inject-governance.ts` subprocesses (~400s) and
mutated shared real repo files (`server.json`, `AGENTS.md`, `CLAUDE.md`, …) in
place, making it unsafe under the forks pool alongside the other script tests.

It now runs entirely in-process against an isolated per-worker temp sandbox:

- `script-paths.ts` `ROOT` honors a backward-compatible `NEXUS_SCRIPT_ROOT`
  override (unset = identical production behavior). This redirects the script's
  whole path graph — including every helper drift-gate that derives from the same
  `ROOT` — at a sandbox seeded with a copy of the files the check/inject logic
  touches. No tracked file is ever mutated.
- `inject-governance.ts` now exports `checkGovernance` / `injectGovernance` and
  guards its CLI entrypoint behind an `import.meta.url === argv[1]` check, so the
  test imports and calls the core directly instead of shelling out.

Runtime dropped from ~400s to ~17s; the file now passes under the real config
alongside the rest of the `scripts/**` suite, so the exclusion is removed.
