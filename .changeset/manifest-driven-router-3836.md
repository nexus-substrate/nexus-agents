---
'nexus-agents': minor
---

feat(orchestration): MetaOrchestrator routes over the strategy-manifest registry (#3836)

The MetaOrchestrator's `decideStrategy` selection logic now routes PURELY over
strategy-manifest data — no strategy names are hardcoded in the router. Adding a
capability becomes "register a manifest with selection rules", not "edit the
router" (Epic C #3833), and that invariant is now TESTED.

- `strategy-manifest.ts` (#3834 schema) gains an optional `selectionRules` field:
  a list of declarative `SelectionRule`s (priority + `patterns` / `pipelineTypes`
  / `complexities` predicates). Self-contained `WorkflowPattern` / `PipelineType` /
  complexity enums mirror the router types. Backed by `governance/strategy-manifests.yaml`
  (mirrored byte-for-byte; the registry test asserts no drift).
- `strategy-manifest-registry.ts` gains `selectStrategyByManifest(signals, manifests?)`
  — a generic matcher that evaluates every manifest's rules and picks the
  highest-priority match (ties broken deterministically by strategy name). It
  names ZERO strategies. The optional `manifests` arg lets a test register a
  synthetic 9th manifest and route it with no router edit.
- All 8 live manifests carry `selectionRules` reproducing the pre-#3836 decision
  table exactly (consensus 100 > greenfield/research 90 > audit-upgrade 80 >
  graph/orchestrate 50 > single-shot 40 > dev-pipeline 30). The behaviour-parity
  matrix is asserted green.
- `MetaDecision` / `MetaSelectionRecord` now record the matched `manifestId` +
  `manifestSchemaVersion` (decision provenance / audit trail).
- File split for the ≤400-line CODING_STANDARDS constraint: `meta-orchestrator.ts`
  drops from 489 → 317 lines. The routing core moved to
  `meta-orchestrator-routing.ts` and the decision/record builders to
  `meta-orchestrator-decision.ts`.

Still literal (by design, not router branches): the structural `strategyFrom*`
helpers remain for the best-first ALTERNATIVES list (a transparency aid, not the
selection path) and the existing parity tests; `run-tool.ts buildDefaultExecutors`
remains a tool-layer map (out of scope — that is run-tool's concern, not the
router's).
