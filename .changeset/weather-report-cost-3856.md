---
'nexus-agents': patch
---

feat(observability): surface decision costs in weather_report + populate manifest cost profiles (#3856)

Epic G child of #3854 (M4). Builds on the #3855 per-decision cost aggregation to
answer "what does a governed decision cost?" from recorded data, riding existing
surfaces — NO new MCP tool.

**weather_report cost section.** `weather_report` gains a `costSection` with two
parts:

- `decisionCosts` — windowed per-gate-type aggregates over the lookback window,
  rolled up from the `DecisionCostStore` records (#3855) via a new PURE,
  fixture-tested `aggregateDecisionCosts` (`observability/decision-cost-aggregate.ts`):
  per `consensus_vote` / `pr_review` gate it reports decision count, average +
  total cost (USD), average + total tokens, average voters, and the
  measured/unmeasured voter split with a `costIsFloor` flag (averages understate
  spend when some voter calls reported no usage — the same honesty the
  per-decision rollup keeps). The store is only constructed when persistence is
  enabled, so a persistence-off context surfaces an empty `decisionCosts` rather
  than throwing; tests inject deterministic records.
- `strategyCostProfiles` — each strategy's declared coarse `costProfile`, read
  straight off the manifest registry (single source of truth) so the surfaced
  hint can never drift from the authored manifest.

**Manifest costProfile populated.** The Epic C `costProfile` field (#3834,
optional until now) is DECLARED for all 8 live strategies, scaled by fan-out:
`low` (single-shot), `medium` (dev-pipeline, pipeline), `high` (consensus,
orchestrate, spec), `variable` (graph-workflow, research). Populated in
`governance/strategy-manifests.yaml` AND mirrored in lockstep into
`STRATEGY_MANIFEST_REGISTRY` (the #3837 drift gate + the YAML↔TS mirror test both
stay green). A refresh path — re-grade against measured per-decision aggregates,
reconcile both sources in lockstep — is documented in the YAML.

BudgetRouter is unchanged: it routes over per-model token budgets, not the
strategy `costProfile`, so there is no static-estimate site to replace (#3856
acceptance criterion verified; changing routing policy/weights is out of scope).

Record + surface only — no routing or weighting change.
