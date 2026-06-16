---
'nexus-agents': minor
---

feat(orchestration): versioned strategy-manifest schema + loader (#3834)

Add the schema foundation for Epic C's manifest-driven MetaOrchestrator (#3833):
a Zod-validated, versioned strategy manifest so a strategy self-describes and the
router can route over manifest data instead of hardcoded rules.

- `src/orchestration/strategy-manifest.ts` — versioned Zod schema + loader
  (strict, zero-`any`), MIRRORING the claims-registry pattern (versioned YAML +
  Zod + loader + Vitest). Per-entry `schemaVersion` (literal, fail-closed on a
  future shape) plus a top-level registry `version`. Required fields model the
  current 8 strategies: `id`, `strategy` (router enum), `entrypointTool`,
  `executorAvailable` (the 4/8 wired-executor gap, declared so routing fails
  closed), `description`, `maturityTier`, `latencyClass` (reuses the #3734
  operation-class taxonomy); optional `whenToForce` (#3838 docs). Forward-compat
  optional fields declared now: `authorityTier` (Epic D #3552) and `costProfile`
  (Epic G). Registry enforces unique `id` AND unique `strategy`.
- `__fixtures__/strategy-manifests.example.yaml` — 2-manifest schema fixture
  (one wired, one fail-closed); NOT loaded by production code.
- `src/orchestration/strategy-manifest.test.ts` — 18 tests: valid manifests,
  bad authority/cost enum, missing required field, duplicate id/strategy,
  schemaVersion literal enforced, router-enum lockstep, fail-closed loader.

Deferred to siblings (out of scope for #3834): migrating the 8 live strategies
and deleting `STRATEGY_ENTRYPOINT_TOOL` (#3835); the manifest-driven router
refactor (#3836); drift-gating the registry under `governance:check` (#3837).
