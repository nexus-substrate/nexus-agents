---
'nexus-agents': patch
---

chore(governance): declare the four un-issued loops' authority tiers + per-loop promotion-criteria docs (#3843, #3844)

The authority ladder (ADR-0017) requires EVERY automated behaviour to declare its
authority tier, but the four loops that are NOT routable strategies —
`suggest_research_tasks`, `improvement_review`, `pr_review`, and the self-tuning
loop — had no declaration surface (the #3841 gate only policed the eight strategy
manifests).

This adds that surface:

- `governance/loop-tiers.yaml` (Zod schema `src/orchestration/loop-tier-manifest.ts`,
  embedded constant `loop-tier-registry.ts`, lockstep-tested) declares each of the
  four loops at its CURRENT implicit tier from the epic Phase-0 recon — zero
  behaviour change (Scope Steward): `suggest_research_tasks` → `suggest`,
  `improvement_review` → `suggest`, `pr_review` → `advisory`, tune loop →
  `enforce` (bounded). The tune loop's `enforce` is justified by its declared
  safety envelope (demotion-only floor 0.5, 0.2-step cap, 30-min decay), NOT a
  ladder promotion — it is a pre-existing default-ON bounded loop (#3323).
- `scripts/check-authority-tier-drift.ts` (under `governance:check`) is extended to
  validate this registry alongside the manifests: an undeclared/mis-shaped loop, a
  YAML↔constant drift, or an `enforce` loop with neither a bounded envelope nor a
  floor-meeting evidence record fails the gate (TDD: a mis-declared loop tier
  proven to fail).
- `docs/governance/loop-promotion-criteria.md` (#3844) writes the per-loop
  promotion/demotion criteria — tune-loop demotion triggers, auto-remediation
  (#3769), KNN weighting (#3815), learned selection (#3552), ClawGuard (#2077) —
  grounded in ADR-0017's evidence-threshold schema; pr_review's criterion is
  owned by Epic E (linked, not duplicated). Each criterion is entered in the
  claims registry as an aspirational→verified transition path.

No tier promotion/demotion is performed; any promotion remains a separate ratified
event. `governance:check`, `claims:check`, `authority-tier:check`, and
`check-docs-indexed` stay green.
