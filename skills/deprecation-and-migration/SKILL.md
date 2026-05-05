---
name: deprecation-and-migration
description: |
  Plan and execute the removal of deprecated APIs without breaking
  consumers. Apply when retiring `@deprecated` markers, renaming public
  surfaces, or version-gating cleanup work. Triggers on "deprecate",
  "remove deprecated", "migration plan", "breaking change", "v3 cleanup".
allowed-tools: Read, Edit, Write, Bash, Grep, Glob
---

# Deprecation and Migration Skill

<!--
  CANONICAL SOURCES:
  - docs/architecture/deprecation-pipeline.md
  - CLAUDE.md "Anti-Sprawl Policy" (one canonical implementation path)
  - Reference incident: epic #2368 (v3.0-gate retirement, 2026-05-04)
  Adapted from addyosmani/agent-skills (MIT, © 2025 Addy Osmani).
-->

## When to apply

- Retiring `@deprecated`-marked APIs
- Renaming public types, classes, or string-union members
- Removing v-gated cleanup work
- Splitting an over-large public API into focused modules
- Sunsetting a config option, env var, or CLI flag

**Skip when:**

- The deprecation marker is fresh (< 1 minor version of bake) — let consumers see the warning first
- No replacement exists yet — implement the replacement first, deprecate the old, then migrate
- The change is purely internal (no public-barrel exposure) — that's a refactor, not a migration

## Pre-removal checklist (before opening the cleanup PR)

- [ ] **Bake duration**: the `@deprecated` marker has been in at least one published release for ≥ 1 minor version. Multi-month bake is preferred for typed APIs.
- [ ] **Replacement is canonical**: the replacement exists, has tests, and is the documented preferred path in `CLAUDE.md` / `docs/`.
- [ ] **Migration recipe drafted**: a one-block diff showing the before/after for the most common consumer use case.
- [ ] **Reachability audited**: `grep -rn` for the deprecated symbol outside the package; check `src/exports/*.ts` to know if it's truly public or internal-only.
- [ ] **Semver target picked**: patch (internal-only or runtime-unchanged), minor (TypeScript-typed-only break), or major (runtime API break).

## The four-step process

### 1. Inventory

List every surface touched by the removal — types, schemas, classes, function names, internal callers, public re-exports, test fixtures, doc references.

```bash
# Symbol reach
grep -rn "DeprecatedName" src/ --include="*.ts" | wc -l

# Public-barrel check
grep -rn "DeprecatedName" src/exports/*.ts src/index.ts

# Doc references
grep -rn "DeprecatedName" docs/ skills/
```

### 2. Decompose into batches

A deprecation removal touching > ~10 files should be split into batches **by blast radius**:

| Batch                       | Scope                                                                | Semver |
| --------------------------- | -------------------------------------------------------------------- | ------ |
| **A — Internal-only**       | Fields/methods never on a public barrel; runtime semantics unchanged | patch  |
| **B — Typed string-unions** | Public union member removal; runtime unchanged                       | minor  |
| **C — Public type aliases** | Public-barrel type removal; runtime unchanged                        | minor  |
| **D — Runtime API**         | Method/function/return-type changes consumers observe at runtime     | major  |

Each batch is its own PR. **Never bundle batches** — the failure mode (one CI gate flake or revert) is much easier when batches are isolated.

### 3. Per-batch implementation

1. Open the branch from current `main`. Confirm `git status` is clean.
2. Make the deletion. Run `pnpm typecheck` — let the type errors guide you to every internal consumer.
3. Update each broken call site to the canonical replacement.
4. Run `pnpm lint && pnpm typecheck && pnpm test`.
5. Add a `.changeset/<issue>-batch-<X>-<name>.md` with semver and migration recipe.
6. Sweep `docs/` for stale references (auto-regenerated docs like TypeDoc HTML refresh on next build).
7. Open the PR. Run `consensus_vote` QA before merge per the standard protocol.

### 4. Post-merge

- Verify the published artifact: `npm view <pkg> version` against `package.json` version.
- Watch for the publish race ([release-changeset-race.md](../../docs/ops/release-changeset-race.md)) — package.json ahead of npm means the workflow re-entered PR mode.
- Close the parent issue/epic only after the artifact is live on npm, not just merged.

## Anti-rationalization — Deprecation removal

| Excuse                                | Counter                                                                                                                                                                                                         |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "It's deprecated, so just delete it"  | Deprecation is a contract with consumers. The marker says "this still works, but plan to migrate." Removal needs replacement + bake + migration recipe.                                                         |
| "Nobody uses it"                      | Verify with `grep` and `npm view <pkg> dist.shasum`-then-search-on-sourcegraph if you must be sure. "Nobody uses it" without evidence is a guess.                                                               |
| "I'll fix the broken consumers later" | Internal callers should be migrated in the same PR as the removal. Deferring it puts you in a state where `main` doesn't compile.                                                                               |
| "It's just a rename"                  | Renames of public types are TypeScript-typed-only breaks. Minor version. Migration recipe required.                                                                                                             |
| "v3.0 will fix it"                    | (Per nexus-agents experience with epic #2368: this is often a way to indefinitely defer work. Re-evaluate the v-gate periodically — many v3-gated cleanups can ship as typed-only minor breaks once they bake.) |
| "The CHANGELOG will explain"          | The CHANGELOG is read by maybe 5% of consumers. Migration recipes need to be self-discoverable from a TypeScript compile error pointing at the new symbol.                                                      |

## Red flags

- Removal PR with no `.changeset/*.md` file
- Removal PR that doesn't compile internally (deferred caller migration)
- Removal of a symbol that has < 1 minor version of `@deprecated` bake
- Removal without checking `src/exports/*.ts` for public reach
- "Migration recipe" that's vague ("use the new API" with no diff block)
- Bundling multiple batches into one PR for "convenience"

## Verification checklist

- [ ] All `@deprecated` usages of the symbol are migrated in the same PR
- [ ] `grep -rn` confirms no remaining references in `src/` (excluding the symbol's own definition file, which is being removed)
- [ ] Public-barrel check: removed from `src/exports/*.ts` if it was exported there
- [ ] `.changeset/<issue>-batch-<X>-<name>.md` exists with correct semver bump
- [ ] Migration recipe in changeset shows a complete diff block, not just a textual description
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` pass
- [ ] `consensus_vote` QA approved (architect + security at minimum)
- [ ] Post-merge: published version on npm matches `package.json` version
- [ ] Stale `@deprecated` doc references swept from `docs/` (auto-regen handles `docs/api/`)
- [ ] Parent issue updated with batch progress (or closed if final batch)

## Reference incident

Epic #2368 (2026-05-04) retired the v3.0 deprecation gate by shipping all 31 `@deprecated` markers in 2.x as 5 batches:

- Batch A (#2369) — internal-only removals → patch
- Batch B (#2371) — `tech_lead` AgentRole removal → minor
- Batch C (#2372) — public-barrel type removal → minor
- BaseAgent.setState removal (#2377) → patch
- agents/experts/task-analyzer.ts removal (#2378) → minor
- OrchestratorType discriminator rename (#2380) → minor

Lessons from that cycle informed this skill — including the publish-race that produced version-skip publishes (`docs/ops/release-changeset-race.md`).
