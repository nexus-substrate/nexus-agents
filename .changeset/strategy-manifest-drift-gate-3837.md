---
'nexus-agents': minor
---

feat(governance): drift-gate the strategy-manifest registry under governance:check (#3837)

Elevate the #3835 "YAML↔TS no-drift" Vitest assertion to an enforced CI governance
gate, so the strategy-manifest registry joins the other single-source registries
policed by `governance:check` — drift fails the build the same way as `claims:check`
and the tool/expert/skill registries.

- `scripts/check-strategy-manifest-drift.ts` — the gate. Fails on (a) YAML↔TS
  drift between `governance/strategy-manifests.yaml` and the embedded
  `STRATEGY_MANIFEST_REGISTRY`; (b) completeness/uniqueness — every
  `ExecutionStrategy` union member must have exactly one manifest and vice-versa
  (no missing, extra, or duplicate strategy); (c) the YAML validating against the
  #3834 Zod schema (the parse throws otherwise). Pure `analyzeManifestDrift` core
  (no I/O) for unit-testing with injected drift.
- Wired into `inject-governance.ts check` (`pnpm governance:check` / the
  docs-check `governance-drift` job) alongside the existing registry drift gates,
  and exposed standalone as `pnpm strategy-manifest:check`.
- `scripts/check-strategy-manifest-drift.test.ts` — RED/GREEN: green on the honest
  registry; red when the YAML diverges from the constant, when the union gains a
  member with no manifest, and when the YAML fails schema validation.

No router or schema changes. No `meta-orchestrator.ts` changes (the
`ExecutionStrategy` union is read from source, not edited).
