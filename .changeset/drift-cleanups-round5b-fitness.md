---
'nexus-agents': patch
---

Round 5b — fix fitness-audit's published-package false-finding cascade ([#2716](https://github.com/williamzujkowski/nexus-agents/issues/2716)).

The audit's `existsSync` checks look at `SRC_ROOT`-relative paths (`cli-adapters/composite-router.ts`, `cli/doctor.ts`, etc.). The actual cause of the "CompositeRouter missing / No CLAUDE.md / 0 createLogger / Missing Doctor" findings I originally diagnosed as "CWD-dependent": **`npx nexus-agents fitness-audit` resolves to the GLOBAL `npm install -g nexus-agents` binary**, not the local workspace bundle. The published 2.76.0 package ships `src/` containing **only** `workflows/` (workflow templates loaded at runtime) — none of the dirs fitness-audit checks for. So every existsSync returned false against the installed copy.

`audit()` now checks for `${SRC_ROOT}/cli-adapters` at the start; if missing, returns a single info-level finding with score 0 telling the operator to run from the source repo (or use `pnpm fitness-audit` from the workspace root). Same audit run from a real source checkout is unchanged.

This also stops `improvement_review` from emitting bogus tech-debt signals downstream of the fitness-audit pollution.
