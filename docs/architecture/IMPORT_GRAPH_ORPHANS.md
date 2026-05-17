---
title: Import-Graph Orphan Detection Design
description: Surface src/ subtrees with no outside callers so dead code is caught at week 1, not week 6
tier: 2
keywords: [governance, fitness, dead-code, orphans, observability]
---

# Import-Graph Orphan Detection

> Design doc for issue [#2409](https://github.com/nexus-substrate/nexus-agents/issues/2409). Implementation tracked in [#2410](https://github.com/nexus-substrate/nexus-agents/issues/2410).

## Problem

The self-development engine in `src/workflows/self-development/` sat unwired since approximately April 2026. Six weeks elapsed before a maintainer audit caught it (#2402, #2403 deleted ~7,700 LOC). Nothing in the existing observability stack surfaced it:

- `weather_report` only sees code that **ran**
- `fitness-audit` scores quality of what's there, not reachability
- `improvement_review` (#2402) is threshold-gated on **outcomes** — orphan code produces zero outcomes, zero signal

This is a coverage gap. Orphan code is not just dead weight — it pulls maintenance attention (lint nudges, dep bumps, formatting changes) that obscures whether anybody is actually using it. The deleted self-dev engine produced ~30 commits during its 6 dead weeks, all noise.

## Goals

1. **Catch orphan modules at week 1, not week 6.**
2. **Low false-positive rate.** Some orphans are legitimate (intentional one-shots, future stubs).
3. **Observability before enforcement.** Land in audit mode; only escalate to gating after a clean dry-run.

## Non-goals

- Auto-deletion. Signals only — humans/votes decide what to delete.
- Cross-package orphan detection. v1 is single-package (the nexus-agents package); cross-package can land later.
- Detecting **partially used** code. v1 is binary: zero outside importers, or not.

## Approach: knip + curated allowlist + improvement_review signal

Don't reinvent. The TypeScript ecosystem has two mature tools:

- `ts-prune` — finds unused exports
- `knip` — finds unused files, exports, dependencies

`knip` is the better choice: more actively maintained, supports monorepo configs, handles dynamic imports via plugin hints. Already used by some peer projects in this codebase's research catalog.

### Algorithm

1. **CI runs `knip --reporter json`** weekly (and on PRs that touch `src/`).
2. **Filter the result against an allowlist** (`docs/ops/orphan-allowlist.json` — module paths with rationale).
3. **For each remaining orphan**: emit a fitness signal AND an `improvement_review` candidate signal (#2402's pattern).
4. **Threshold gate**: orphan count > N for >2 weeks → fitness score penalty + auto-filed candidate issue (rate-limited per existing 5/hour rule).

### Importer definition

knip's default: a module is alive if **any** other module imports it (statically OR via configured dynamic-import plugins). Test files count as importers (alive ≠ used in production, but a tested module is being maintained).

This is the right v1 default. A future v2 could split:

- **Production-alive**: imported from a non-test file
- **Test-alive**: imported only from tests
- **Orphan**: nobody imports it

Tag-in-source for legitimate orphans:

```ts
/* @intentional-orphan: migration script, runs once at v3 launch (#XYZ) */
export function migrateOldData(): void { ... }
```

knip respects JSDoc-style ignore tags via configuration.

### Staleness threshold

Two-stage:

- **Module is orphan** (zero importers): immediate signal candidate (audit mode)
- **Module is orphan AND last-non-trivial-commit > 14 days ago**: fitness penalty fires

The 14-day threshold prevents false positives on freshly-introduced modules that are about to be wired (e.g., a new MCP tool whose registration PR is still open). "Non-trivial commit" excludes lint nudges, dep bumps, and prettier-only changes — git heuristic via author + commit-message regex.

### Failure mode: 3-stage promotion

Mirroring the `improvement_review` (#2402) and schema-fanout (#2407) observability-first pattern:

- **v1 (audit only)**: knip output logged, no enforcement, ship for 1 week
- **v2 (signal in fitness)**: orphan count contributes to fitness score, no gate
- **v3 (gate)**: fitness floor (90) means N orphans of age >14 days fails CI

Promotion gated on dry-run review: orphan list at v1 must be ≤10 modules and ≤2 false positives before v2.

## Bootstrap allowlist

Some categories of file are intentionally orphan and should be allowlisted from day one:

- `scripts/` — invoked from `package.json` scripts or one-shot CLI; not imported.
- `migrations/` (if any) — invoked by name, not by import.
- `examples/` — illustrative only.
- Top-level `index.ts` files in plugin subdirectories that are loaded dynamically.

Mechanism: `orphan-allowlist.json` with structure:

```json
{
  "version": "1.0.0",
  "patterns": [
    { "glob": "scripts/**", "rationale": "CLI scripts, invoked by name" },
    { "glob": "**/migrations/**", "rationale": "Data migrations, invoked by name" },
    { "glob": "examples/**", "rationale": "Illustrative code, intentionally not imported" }
  ],
  "specific_files": [
    {
      "path": "packages/nexus-agents/src/cli/init-portable.ts",
      "rationale": "CLI subcommand, registered via dispatcher (#2311)",
      "expires": "2026-06-30"
    }
  ]
}
```

Glob patterns are durable; specific-file allowlist entries get an `expires` date so they don't accumulate forever.

## Risks and tradeoffs

- **Dynamic imports.** Plugins, MCP tool registrations, and config-driven loading evade static analysis. Mitigation: knip plugin config + `@intentional-orphan` tags. Audit mode for v1 means false positives don't block PRs.
- **knip churn.** New knip releases could change defaults. Mitigation: pin to a specific version in `devDependencies`; promote intentionally.
- **Fitness gate misuse.** A v3 hard fail on orphan count could block a refactor PR mid-flight (refactor temporarily orphans a module that's about to be deleted in the same PR). Mitigation: threshold of orphans > N (not orphans = N+1); plus the 14-day staleness window.
- **Performance.** knip on a large codebase takes minutes. Mitigation: run weekly + on `src/` touch only, not every PR.

## What this would have caught

Counterfactuals:

- **Self-development engine (#2402)**: orphan since April. v1 audit mode would have logged it within a week. v2 would have penalized fitness for 6 weeks. v3 would have gated PRs. Even just v1 in slack-channel form would have surfaced the issue.
- **Old test-analyzer module (#2378)**: deprecated, eventually removed. v1 would have flagged it as unused before deprecation, accelerating removal.
- **`tech_lead` rename (#2380)**: not an orphan case — alive but renamed. Out of scope.

## Implementation cost

- Add `knip` as a dev dependency (~500KB).
- New script: `scripts/check-orphans.ts` (~150 LOC, wraps `knip --reporter json`, applies allowlist, formats output).
- Allowlist: `docs/ops/orphan-allowlist.json` (initial set above).
- New CI job: weekly cron + PR-on-src/ touch. Audit mode for v1 means "log to issue or check output, no enforcement."
- Unit test for allowlist filter logic (cheap).
- New `improvement_review` detector (`detectOrphanModules`): consumes knip output, emits signals like the existing detectors.

Estimated work: ~1 day for v1 audit mode. v2/v3 tracked separately.

## Acceptance for the design (this doc)

- [ ] Picks tooling (knip)
- [ ] Specifies importer definition (any module, including tests)
- [ ] Defines staleness threshold (immediate orphan signal + 14-day fitness penalty)
- [ ] Names false-positive handling (allowlist + tag-in-source)
- [ ] Specifies the 3-stage promotion (audit → fitness → gate)
- [ ] Lists bootstrap allowlist patterns
- [ ] Identifies risks and mitigations

Implementation begins in #2410 once this design lands.
