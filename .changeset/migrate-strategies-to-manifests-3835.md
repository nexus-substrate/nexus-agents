---
'nexus-agents': minor
---

feat(orchestration): migrate all 8 run-tool strategies to the manifest registry (#3835)

Replace the hardcoded `STRATEGY_ENTRYPOINT_TOOL` map (run-tool.ts) and the
implicit "which strategies have a wired executor" knowledge with eight registered
strategy manifests, validated against the #3834 Zod schema. Adding a capability
becomes "register a manifest", not "edit a map in the tool layer" (Epic C #3833).

- `governance/strategy-manifests.yaml` — the human-facing source of truth: one
  manifest per strategy (single-shot, dev-pipeline, pipeline, graph-workflow,
  orchestrate, consensus, spec, research) with entrypointTool, executorAvailable
  (4/8 true: dev-pipeline, pipeline, research, consensus), description,
  whenToForce, maturityTier, latencyClass. Forward-compat authorityTier (Epic D)
  / costProfile (Epic G) intentionally omitted until those epics populate them.
- `src/orchestration/strategy-manifest-registry.ts` — the same 8 manifests
  embedded as a typed constant (no disk I/O on the MCP hot path), validated
  through the Zod schema at module load (fail-closed on a malformed embedded
  manifest). Exposes `entrypointToolFor` / `executorAvailableFor` /
  `getStrategyManifest`.
- run-tool.ts now resolves `recommendedTool` via `entrypointToolFor(strategy)`;
  the `STRATEGY_ENTRYPOINT_TOOL` constant + its barrel export are DELETED (zero
  remaining references to the symbol).
- Behaviour-parity golden test: the pre-migration entrypoint map and the
  wired-executor set are snapshotted verbatim and asserted to match the
  manifest-sourced lookups exactly for all 8 strategies — proving the migration
  is a no-op on behaviour. Plus full-coverage, fail-closed, and a YAML↔TS
  no-drift assertion.

Deferred: the `decideStrategy` selection-logic refactor that routes PURELY over
manifest capability predicates is #3836; drift-gating the YAML under
`governance:check` is #3837.
