---
title: 'ADR 0020: Observability Feedback Loop Boundaries'
description: Architectural decision closing Issue #4289 (observability-feedback loop) — EventBus remains the sole canonical signal bus; fitness signals are reserved for tech debt/remediation and do not mutate adaptive thresholds or routing.
diataxis: none
audience: project
tier: 3
keywords:
  [
    observability,
    feedback-loop,
    adaptive-thresholds,
    fitness-score,
    event-bus,
    tune-stage,
    anti-sprawl,
    adr,
  ]
---

# ADR 0020: Observability Feedback Loop Boundaries

**Status:** Accepted  
**Date:** 2026-10-12  
**Context:** Issue #4289 — "feat(observability): close the feedback loop — fitness→adaptive-thresholds (currently shadow-only) + optional IFeedbackCoordinator" (promoted from Findings catalog #3160 / #4271).  
**Ratification:** `consensus_vote` (live panel: Architect, Security Engineer, Scope Steward), **APPROVED 3/0** (100% approval, 2/3 majority on Option B).

---

## 1. Context & Problem Statement

Findings catalog #3160 flagged two medium-severity findings regarding the observability feedback loop:

1. **Fitness signals are shadow-only:** `signal.fitness_declined` is emitted by `improvement_review_signals` and consumed by `tune-stage`, but only as `flag_tech_debt` in shadow mode ("Non-routing signals (fitness/vote) stay shadow-logged"). No routing/threshold/observability-window mutation results; `adaptive-thresholds.ts` never reads fitness.
2. **No unifying feedback coordinator:** An `IFeedbackCoordinator` / `SignalBus` had been suggested to coordinate the four feedback state-holders (`FeedbackIntegration`, `OutcomeFeedbackCollector`, `StrategyDistiller`, `RoutingMemory`).

Issue #4289 asked to:

- Decide whether fitness dimensions should influence `adaptive-thresholds` / observability-window sizing out of shadow mode with a bounded, audited adjustment, or remain strictly for tech-debt/remediation.
- Evaluate whether a thin `IFeedbackCoordinator`/`SignalBus` is required, or explicitly decide the emergent typed EventBus is sufficient.

---

## 2. Decision

The consensus panel evaluated three architectural options:

- **Option A:** Unified `IFeedbackCoordinator` + Bounded fitness conservatism on cold-start (shadow-by-default).
- **Option B (Selected):** EventBus-only (reject new coordinator) + Fitness strictly for tech-debt/remediation (no threshold mutation).
- **Option C:** Thin `IFeedbackCoordinator` for status/query only + EventBus event conduit + Bounded fitness-dampened thresholds.

The panel approved **Option B**:

### A. Rejection of `IFeedbackCoordinator` / `SignalBus` (Anti-Sprawl & DRY)

1. **Bus A (`IEventBus`) is the canonical signal bus:** The typed `PipelineEvent` discriminated union on Bus A (`packages/nexus-agents/src/pipeline/event-types.ts`) with `signal.*` events (`signal.fitness_declined`, `signal.swarm_unhealthy`, `signal.vote_rejected`) already serves the exact SignalBus requirement established in Epic #3143 P2 / #3147.
2. **Existing composition:** The four feedback APIs are not uncoordinated peers:
   - `FeedbackIntegration` already composes `OutcomeFeedbackCollector` by construction (`feedback-integration.ts:169-172`).
   - `CompositeRouter` is the single consumer that reaches the `StrategyDistiller` and `RoutingMemory` singletons.
3. **Precedent against coordinator sprawl:** Two earlier coordinator-shaped abstractions were previously removed for lack of a consumer:
   - `learning.threshold_updated` / `learning.trend_detected` events were deleted in #3022 ("emit helpers and subscribers both never landed").
   - The server-wide `feedback-subscriber` singleton was removed in #5003 because it fabricated CLI attribution.
4. **Anti-sprawl rule:** Introducing a third coordination surface violates anti-sprawl and YAGNI without a named consumer.

### B. Fitness Strictly Scoped to Tech Debt & Remediation (Domain Separation)

1. **Category error between static health and runtime capability:**
   - Codebase fitness (`fitness-score.ts`) measures static repository structure: `canonicalPaths`, `configSimplicity`, `layerSeparation`, `governanceIntegration`.
   - `computeAdaptiveThresholds` (`adaptive-thresholds.ts`) calculates dynamic success-rate baselines and max bonus caps for task routing based on empirical `TaskOutcome` history from `OutcomeStore`.
   - Code duplication or layer separation does not causally dictate which CLI has a higher probability of succeeding on code generation or refactoring tasks. Conflating static code metrics with execution success baselines injects uncorrelated noise into the learner.
2. **Uniform scalar limitation:** Fitness is a single scalar per audit. Any dampening factor would apply uniformly across all arms, scaling all `maxBonus` values identically without altering relative rankings.
3. **No measurable outcome:** Under the Mission's capability-bias clause, changes that cannot be measured against real outcome metrics are rejected ("anything that cannot be measured"). Mutating `computeAdaptiveThresholds` (whose only production consumer is the diagnostic `weather-report.ts`) would shadow a no-op with zero effect on routing.
4. **Appropriate consumer:** `signal.fitness_declined` is correctly routed to `flag_tech_debt` remediation issue-filing and review paths (Epic #3653), not routing demotions or threshold dampening.

---

## 3. Consequences

- **Invariants pinned:** Negative invariant tests (`tune-stage-invariants.test.ts`) guarantee that `signal.fitness_declined` never calls `TuneAdjustmentStore.demote`, never mutates routing multipliers, and never emits audit demotion logs, even under `enabled: true` (enforce mode).
- **Domain decoupling:** `computeAdaptiveThresholds` remains a pure function of `OutcomeStore` task history.
- **Documentation clarified:** `EVENT_BUS_BOUNDARIES.md` and `tune-stage.ts` explicitly reference this decision, documenting that non-routing signals stay shadow-logged because they belong to remediation/tech-debt, not routing state.
