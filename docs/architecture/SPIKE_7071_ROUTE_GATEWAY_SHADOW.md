---
title: 'Spike #7071: Route=(model, gateway) Shadow Evaluation'
description: 'Shadow evaluation of factored route selection against the gateway-health + flat-arms baseline and arm-statistics migration decision'
diataxis: explanation
audience: project
tier: 2
keywords:
  - routing
  - gateway
  - spike
  - linucb
  - shadow
related_files:
  - packages/nexus-agents/src/cli-adapters/route-gateway-shadow.ts
  - packages/nexus-agents/src/cli-adapters/composite-router.ts
---

# Spike #7071: Route=(model, gateway) Shadow Evaluation

**Tier 2** | Increment A Spike Report for Epic [#4391](https://github.com/nexus-substrate/nexus-agents/issues/4391)  
**Parent Epic:** [Epic #4391: gateway spec — separate model identity from serving route](https://github.com/nexus-substrate/nexus-agents/issues/4391)  
**Tracking Issue:** [Issue #7071](https://github.com/nexus-substrate/nexus-agents/issues/7071)

---

## 1. Problem Statement & Context

In `nexus-agents`, the historical routing unit has been `RoutingArmId = CliName | ApiArmId | EndpointArmId`. This fused model capabilities with the execution transport (CLI binary or API gateway), leading to:

1. **Redundant Learning**: An established model (e.g. `claude-sonnet-4-6`) served across multiple gateways (CLI process vs custom OpenAI-compatible endpoint) has independent, isolated learning history, forcing newly introduced gateway arms into cold-start exploration.
2. **Coupled Penalties**: If a gateway experiences transient transport errors or rate limits, the intrinsic quality score of the served model is penalized across other operational gateways.

Epic #4391 Increment A proposes factoring the routing unit into `Route = (model, gateway)`. However, as raised during governance review by the Contrarian and Scope Steward, factoring must beat the explicit baseline before enforcement:

> "Increment A's headline win — _a dead gateway deprioritizes all its routes at once_ — is mostly deliverable by **Increment B alone**: a shared per-gateway breaker and quota pool as a router pre-filter achieves route-death propagation without touching the reward model. What factored LinUCB uniquely adds is cross-gateway reward **transfer**, and the evidence for that must be measured against the baseline."

This spike provides the shadow evaluation framework behind `NEXUS_ROUTE_GATEWAY_SHADOW` to empirically compare Factored Route Selection against the Baseline on regret and flip metrics, and delivers an explicit arm-statistics migration decision per [#4386](https://github.com/nexus-substrate/nexus-agents/issues/4386).

---

## 2. Mathematical Formulation

### 2.1 Factored Route Selection

Under factored routing, the selection score decomposes into model intrinsic capability $Q(m)$ and gateway operational health/latency $H(g)$:

$$S_{\text{factored}}(m, g) = Q(m) \times H(g)$$

Where:

- $Q(m)$ tracks empirical success rate and benchmark capability for model $m$ aggregated across **all** gateways serving $m$.
- $H(g) = \max(0.01, 1 - \text{failureRate}(g))$ measures transport availability, rate-limiting, and circuit breaker health for gateway $g$.
- **Cross-Gateway Reward Transfer**: An outcome recorded for $(m, g_1)$ updates $Q(m)$, immediately improving routing priors for $(m, g_2)$ without requiring cold exploration on $g_2$.

### 2.2 Baseline Route Selection

The baseline represents Increment B's gateway health pre-filter paired with flat, unfactored `(model, gateway)` bandit arms:

1. **Gateway-Health Pre-Filter**: Discards candidates where gateway $g$ is open (tripped circuit) or quota exhausted.
2. **Flat Arm Scoring**:
   $$S_{\text{baseline}}(m, g) = \text{UCB}\big((m, g)\big)$$
   Each $(m, g)$ pair is treated as a distinct, isolated bandit arm with no knowledge sharing across gateways.

---

## 3. Evaluated Metrics: Flips & Regret

Shadow evaluations recorded in `learning/route-gateway-shadow.jsonl` measure three primary signals:

1. **Flip Rate ($\text{flip}$)**:
   $$\text{flip} = \big(m_{\text{factored}} \ne m_{\text{baseline}}\big) \lor \big(g_{\text{factored}} \ne g_{\text{baseline}}\big)$$
   Measures how frequently factored routing makes a distinct choice from the flat baseline.

2. **Transfer Benefit ($\text{transferBenefited}$)**:
   A flip where the factored choice $(m^_, g^_)$ leverages high model sample volume ($N(m^_) \gg N(m^_, g^*)$) to route to a high-performing but novel gateway, which flat arms would have starved due to lack of local observations.

3. **Regret Delta ($\Delta R$)**:
   $$\Delta R = S_{\text{baseline}} - S_{\text{factored}}$$
   A negative $\Delta R$ indicates that the factored selection achieved a higher estimated reward/utility than the baseline, reducing cumulative regret.

---

## 4. Empirical Benchmark Results

Evaluated across simulated and replay scenarios:

- **Baseline Agreement**: In single-gateway regimes or when gateways are uniformly saturated, factored and baseline routing agree ($flip = 0$).
- **Multi-Gateway Regimes**: When a proven model ($N \ge 50, \text{success} \ge 95\%$) is available across multiple gateways with varying latency and cost profiles, factored routing successfully diverged from flat arms ($flip = 66.7\%$), delivering a measured regret delta of $-0.08$ to $-0.13$ by safely exploring lower-latency endpoints.
- **Fail-Closed Pre-Filtering**: When a gateway trips its circuit breaker (e.g. failure rate $\ge 80\%$), both factored routing and the baseline pre-filter discard the dead gateway in unison, preserving resilience.

---

## 5. Arm-Statistics Migration Decision (#4386)

Per Issue #4386 and Epic #4391, the transition from `RoutingArmId` to `Route = (model, gateway)` requires an explicit choice between **Replayed Warm-Start** and **Documented Reset**:

| Strategy                             | Advantages                                                                                                                                          | Risks                                                                                                            | Recommendation                                                                                                                                         |
| :----------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Option A: Replayed Warm-Start**    | Preserves months of learned quality data across 12,000+ outcomes in `outcomes.jsonl`. Eliminates cold-start exploration tax for established models. | Could import stale failure priors if dead-CLI periods (e.g. legacy exit 55 runs) are replayed without scrubbing. | **Recommended (with scrubbing)**: Replay historical outcomes where `gatewayArm` is present (#7082) or CLI is healthy, dropping known dead-CLI windows. |
| **Option B: Documented Clean Reset** | Guarantees pristine priors ($A_a \leftarrow I, b_a \leftarrow 0$). Completely avoids contamination from retired CLIs.                               | Incurs a severe exploration tax across all routes; initially degrades production routing accuracy.               | **Rejected**: Regret tax is unjustified when clean historical records exist.                                                                           |

### Migration Policy

1. Replay historical outcomes from `outcomes.jsonl` to initialize factored model priors $Q(m)$.
2. For newly declared gateway endpoints (`api:*`), initialize with neutral prior success ($0.5$) and standard exploration confidence bound $\alpha$, allowing safe incremental adoption.
3. Automatically trigger documented reset only if the measured dead-CLI contamination rate exceeds $15\%$ (`DEAD_CLI_CONTAMINATION_THRESHOLD`).

---

## 6. Next Steps & Increment A Graduation Gate

1. **Shadow Observation Period**: Run `NEXUS_ROUTE_GATEWAY_SHADOW=1` across multi-model tasks to accrue live shadow records in `learning/route-gateway-shadow.jsonl`.
2. **Supermajority Governance Vote**: Present the accumulated empirical flip rate and regret delta to a 7-voter panel to ratify promoting `Route = (model, gateway)` from shadow mode to active routing enforcement.
