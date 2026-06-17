---
title: 'What Does a Governed Decision Cost?'
description: How a governed decision (consensus_vote / pr_review) accrues cost — per-voter rollup to per-decision summary, the measured-vs-unmeasured floor, plan vs api billing, reading the weather_report cost section, and what each strategy's costProfile means. Grounded in the shipped DecisionCostStore (#3855), the weather_report cost section (#3856), and the manifest cost profiles.
tier: 2
keywords:
  [
    cost,
    governed-decision,
    consensus,
    pr-review,
    weather-report,
    billing,
    costProfile,
    tokens,
    observability,
    floor,
    unmeasured,
  ]
---

# What Does a Governed Decision Cost?

**Status:** Active
**Date:** 2026-06-17
**Epic:** G — Cost telemetry per governed decision (#3854)
**Sources:** #3855 (per-decision rollup), #3856 (weather_report + manifest cost
profiles), #3857 (this doc)

This is the honest answer to "what does a governed decision cost?" — grounded in
the cost telemetry that actually ships, not in projected figures. It explains how
cost accrues, what is measured today versus what is a known floor, and how to read
the surfaces that report it.

## TL;DR

- A **governed decision** — a `consensus_vote` or `pr_review` run — fans out to N
  independent voter calls. Cost is rolled up **per-voter → per-decision**: each
  voter contributes `{role, model, inputTokens, outputTokens, costUsd}`, and the
  decision summary totals them (`packages/nexus-agents/src/observability/decision-cost.ts`).
- **Unmeasured is not $0.** A voter that reports no usage (a subscription-CLI
  adapter that doesn't surface tokens, an error vote that never reached a model)
  is counted as **unmeasured** and contributes 0 to the totals — but the summary
  records that the total is a **floor**, not an exact figure.
- **Billing mode** changes what the dollar figure means: `plan` records $0 cost
  while keeping token counts (spend is pre-covered by a subscription); `api`
  records the registry-priced dollar cost. Default is `plan`.
- **As of this writing, per-voter token counts are largely unmeasured** pending
  adapter propagation (#3910). Treat the dollar/token totals as a floor and the
  per-decision counts (how many voters, which models) as the reliable signal until
  #3910 lands.
- The **weather_report** cost section surfaces per-gate-type aggregates over a
  lookback window plus each strategy's declared `costProfile`.

## How a governed decision accrues cost

A governed decision is one panel run that fans out to multiple LLM calls:

| Gate             | Panel                                                 | Roles                                                                       |
| ---------------- | ----------------------------------------------------- | --------------------------------------------------------------------------- |
| `consensus_vote` | Up to a **7-voter** panel of independent perspectives | architect, security, devex, and more (strategy `consensus`, profile `high`) |
| `pr_review`      | A **5-role** adversarial panel wrapping consensus     | architect, security, devex, catfish, scope_steward (`PR_REVIEW_EVAL_ROLES`) |

Each voter is one model call. Per-call token + cost telemetry already existed (the
usage log, `packages/nexus-agents/src/learning/usage-log.ts`). The cost-telemetry
epic added the **aggregation** layer that rolls those per-call numbers up into one
per-decision answer.

The flow is:

1. The panel runs; each voter returns a result carrying its `role`, `model`, and —
   where the adapter reported them — `inputTokens` / `outputTokens`
   (`votesToCostInputs` in `packages/nexus-agents/src/mcp/tools/decision-cost-recording.ts`).
2. Each voter's dollar cost, when tokens are present, is derived with the same
   registry-backed `computeCostUSD` the per-call usage log uses — so a per-decision
   rollup and the per-call log price identically.
3. `rollupDecisionCost` (pure, in `observability/decision-cost.ts`) folds the N
   voters into a `DecisionCostSummary`: total tokens, total USD, a per-voter
   breakdown, a per-model breakdown, and the measured/unmeasured voter split.
4. The summary is persisted one record per decision in the `DecisionCostStore`
   (`observability/decision-cost-store.ts`, JSONL, bounded retention) and attached
   to the decision response. **No new MCP tool** — it rides the existing surface.

So "what did this decision cost?" is answerable from recorded data: read the
`DecisionCostStore` record for the decision id, or the per-gate aggregate in the
weather report.

## The measured-vs-unmeasured floor (the honesty rule)

The single most important thing to understand about these numbers: **a missing
cost is treated as unmeasured, never as a true $0.**

A voter contributes "measured" usage only if it reported a token count or a cost.
A voter with none — a CLI-subscription adapter that does not surface usage, an
error vote that never reached the model, a simulated vote — is folded in as
**unmeasured**. It contributes 0 to the totals (there is nothing else it can
contribute), but the summary records that fact:

- `measuredVoters` / `unmeasuredVoters` / `voterCount` — the confidence split.
- A total is a **floor** whenever `unmeasuredVoters > 0`: the real cost is _at
  least_ this, because unmeasured voters' unknown real cost was counted as 0.

Treating unmeasured as a real $0 would silently understate spend. The system
refuses to do that. When you read any total, read it alongside the
measured/unmeasured split. In the per-gate aggregate this is surfaced as an
explicit `costIsFloor` boolean.

> **Current state (#3910).** Per-voter token counts are largely **unmeasured**
> today: the adapter layer does not yet propagate per-voter tokens through the
> vote result for every adapter, and decision-cost drops are currently silent.
> #3910 tracks both fixes. Until it lands, expect `unmeasuredVoters > 0` on most
> decisions, the dollar/token totals to be a floor (often $0 under `plan` mode),
> and the **reliable** signal to be the structural facts: how many voters, which
> models, which gate. Do not quote a per-decision dollar figure as exact.

## Plan vs api billing mode

Cost is recorded under a billing mode (mirrors `NEXUS_BILLING_MODE`):

| Mode   | Dollar cost recorded                 | Tokens recorded | When it applies                                                   |
| ------ | ------------------------------------ | --------------- | ----------------------------------------------------------------- |
| `plan` | **$0** (pre-covered by subscription) | kept            | Default. Subscription/CLI auth; spend is flat-rate, not per-token |
| `api`  | registry-priced USD per voter call   | kept            | `NEXUS_BILLING_MODE=api`; metered per-token API keys              |

Plan mode zeroes the dollar cost **but keeps the token counts**, so an operator can
still see consumption and a later `api`-mode reprice is possible. This mirrors how
plan mode zeroes cost in routing/scoring without dropping the token signal. The
default resolves to `plan` (`resolveBillingMode` in `decision-cost-recording.ts`),
so unless you have set `NEXUS_BILLING_MODE=api`, the dollar totals you see are $0 by
construction — the meaningful number under plan mode is **tokens**, not dollars.

## Reading the weather_report cost section

`weather_report` carries a `costSection` (Epic G, #3856; see the `CostSection`
type in `packages/nexus-agents/src/mcp/tools/weather-report-types.ts`) with two
parts:

### 1. Per-gate decision-cost aggregates (`decisionCosts`)

`aggregateDecisionCosts`
(`packages/nexus-agents/src/observability/decision-cost-aggregate.ts`) rolls the
persisted per-decision records up into one per-gate answer over a lookback window:

- `gate` — `consensus_vote` or `pr_review`.
- `decisionCount` — how many decisions folded in.
- `avgCostUsd`, `avgTokens`, `avgVoters` — the per-decision means.
- `totalCostUsd`, `totalTokens` — the window sums.
- `measuredVoters` / `unmeasuredVoters` — the confidence split.
- `costIsFloor` — **true when any voter was unmeasured**: the averages understate
  true spend.

Read `costIsFloor` first. When it is true (the common case today, per #3910), the
averages are a lower bound; lean on `avgVoters` and the per-gate decision count for
the structural story rather than the dollar mean.

### 2. Strategy cost profiles (`strategyCostProfiles`)

Each registered strategy's declared `costProfile`, read straight off the manifest
registry (the single source of truth — it cannot drift from the authored manifest).
See the next section.

## What each strategy's `costProfile` means

`costProfile` is a **coarse, authored cost hint** scaled by a strategy's fan-out —
not a measured dollar figure. The enum is
`low | medium | high | variable`
(`CostProfileSchema`, `packages/nexus-agents/src/orchestration/strategy-manifest.ts`).
It is declared for every live strategy and refreshed against the measured
per-decision aggregates the `DecisionCostStore` records.

| Profile    | Meaning                                                         |
| ---------- | --------------------------------------------------------------- |
| `low`      | One model call — the cheapest engine                            |
| `medium`   | A templated multi-stage gate — bounded fan-out                  |
| `high`     | An N-voter panel / multi-agent orchestration / greenfield build |
| `variable` | Spend scales with input size (graph topology, research breadth) |

The eight live strategies (`packages/nexus-agents/src/orchestration/strategy-manifest-registry.ts`):

| Strategy         | Entrypoint tool      | `costProfile` | Why                                            |
| ---------------- | -------------------- | ------------- | ---------------------------------------------- |
| `single-shot`    | `delegate_to_model`  | `low`         | One model call                                 |
| `dev-pipeline`   | `run_dev_pipeline`   | `medium`      | Multi-stage dev gate (test / lint / typecheck) |
| `pipeline`       | `run_pipeline`       | `medium`      | Templated multi-stage pipeline                 |
| `graph-workflow` | `run_graph_workflow` | `variable`    | Spend scales with graph topology               |
| `orchestrate`    | `orchestrate`        | `high`        | Multi-agent fan-out (wave / aflow / puppeteer) |
| `consensus`      | `consensus_vote`     | `high`        | Up to a 7-voter panel — N calls per decision   |
| `spec`           | `execute_spec`       | `high`        | Greenfield multi-stage build from a spec       |
| `research`       | `run_pipeline`       | `variable`    | Spend scales with research breadth             |

A rough ordering of governed spend, then, runs from a `single-shot` delegate
(`low`, one call) → a `dev-pipeline` / `pipeline` gate (`medium`, bounded stages) →
a full `consensus_vote` or `pr_review` panel and `orchestrate` / `spec` runs
(`high`, N calls per decision). `variable` strategies (graph, research) sit
wherever their input size places them. These are hints for cost-aware routing, not
billing-grade numbers — the billing-grade numbers come from the measured aggregates
above once #3910 lands per-voter token propagation.

## Methodology and variance notes

- **Measured numbers come only from `api` billing mode with reporting adapters.**
  Under `plan` mode (the default) the dollar figure is $0 by design; tokens are the
  signal.
- **All totals are a floor when `unmeasuredVoters > 0`.** This is the dominant
  caveat today (#3910) — most per-decision totals are floors.
- **Variance is real and not yet characterized.** Panel fan-out (a `consensus`
  panel can run up to 7 voters; `pr_review` runs 5 roles), model mix, and prompt
  size all move per-decision cost. The aggregate reports means over a window, not a
  distribution; do not read `avgCostUsd` as a tight estimate.
- **Any cost claim in README/positioning must trace to measured data**, not to
  this doc's structural description. Until measured per-decision aggregates with
  propagated per-voter tokens exist (#3910), positioning should describe the
  _shape_ of governed-decision cost (per-voter rollup, floor honesty, profile
  ordering) rather than quote a dollar figure. This honesty is the evidence base
  for any future batch-mode decision (#2699).

## References

- Epic: [#3854](https://github.com/nexus-substrate/nexus-agents/issues/3854) — cost telemetry per governed decision
- [#3855](https://github.com/nexus-substrate/nexus-agents/issues/3855) — per-voter per-decision cost aggregation
- [#3856](https://github.com/nexus-substrate/nexus-agents/issues/3856) — weather_report + manifest cost profiles
- [#3857](https://github.com/nexus-substrate/nexus-agents/issues/3857) — this doc
- [#3910](https://github.com/nexus-substrate/nexus-agents/issues/3910) — propagate adapter per-voter tokens; make decision-cost drops non-silent
- [#2699](https://github.com/nexus-substrate/nexus-agents/issues/2699) — batch-submission mode (cost data here is the trigger evidence)
- Per-decision rollup: `packages/nexus-agents/src/observability/decision-cost.ts`
- Persistence: `packages/nexus-agents/src/observability/decision-cost-store.ts`
- Per-gate aggregate: `packages/nexus-agents/src/observability/decision-cost-aggregate.ts`
- Recording bridge: `packages/nexus-agents/src/mcp/tools/decision-cost-recording.ts`
- Weather report cost section: `packages/nexus-agents/src/mcp/tools/weather-report-types.ts` (`CostSection`)
- Strategy cost profiles: `packages/nexus-agents/src/orchestration/strategy-manifest-registry.ts`, `strategy-manifest.ts` (`CostProfileSchema`)
- MCP tool count: see `packages/nexus-agents/src/mcp/tools/tool-manifest.ts` (do not hardcode)
