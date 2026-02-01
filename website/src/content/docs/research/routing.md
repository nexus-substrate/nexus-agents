---
title: 'Routing Research'
description: 'Research on intelligent routing of tasks to optimal models based on cost, quality, and latency constraints. Covers quality-constrained routing, preference-trained routers, cascade strategies, and m...'
---

**Last Updated:** 2026-01-10 (ET)
**Status:** Active Research (Core Routing Implemented)

---

## Overview

Research on intelligent routing of tasks to optimal models based on cost, quality, and latency constraints. Covers quality-constrained routing, preference-trained routers, cascade strategies, and multi-criteria optimization.

## Key Papers

| Paper                                               | Key Contribution                                  | Priority | Status          |
| --------------------------------------------------- | ------------------------------------------------- | -------- | --------------- |
| [IPR](https://arxiv.org/abs/2509.06274)             | Quality-constrained routing, 43.9% cost reduction | P1       | partial         |
| [PILOT](https://arxiv.org/abs/2508.21141)           | Budget-constrained LinUCB routing                 | P1       | **implemented** |
| [SATER](https://arxiv.org/abs/2510.05164)           | Confidence-aware rejection, 50%+ cost reduction   | P2       | partial         |
| [MoMA](https://arxiv.org/abs/2509.07571)            | TOPSIS multi-criteria, 31.46% cost reduction      | P2       | **implemented** |
| [RouteLLM](https://arxiv.org/abs/2406.18665)        | Preference-trained routing, 2x cost reduction     | P2       | planned         |
| [Edge Multi-LLM](https://arxiv.org/abs/2507.00672)  | Agreement-based cascading                         | P2       | **implemented** |
| [Cross-Attention](https://arxiv.org/abs/2509.09782) | Query-model matching                              | -        | not-started     |
| [OptiRoute](https://arxiv.org/abs/2502.16696)       | kNN + hierarchical filtering                      | -        | not-started     |

**Implementation Notes:**

- PILOT: BudgetRouter + LinUCBBandit in `cli-adapters/`
- MoMA: TopsisRouter in `cli-adapters/topsis-router.ts`
- Edge Multi-LLM: AgreementCascadeRouter in `cli-adapters/agreement-cascade-router.ts`
- All unified via CompositeRouter (Epic #164)

## Recommended Techniques

### High Priority (P1)

#### IPR Quality-Constrained Routing

- **Source:** [arxiv-2509.06274](https://arxiv.org/abs/2509.06274)
- **Key Metrics:** 43.9% cost reduction, sub-150ms latency
- **Integration Point:** `packages/nexus-agents/src/adapters/`, `packages/nexus-agents/src/agents/tech-lead.ts`
- **GitHub Issue:** #102

Quality-constrained routing with user-controlled tolerance parameter and lightweight estimators. Directly applicable to CLI adapter capability matching.

#### PILOT Budget-Constrained Routing

- **Source:** [arxiv-2508.21141](https://arxiv.org/abs/2508.21141)
- **Key Metrics:** Adaptive budget handling
- **Integration Point:** `packages/nexus-agents/src/workflows/execution-planner.ts`
- **GitHub Issue:** #102

Contextual bandit (LinUCB) with preference-prior routing and multi-choice knapsack budget constraints. Add cost tracking to ContextBudget.

### Medium Priority (P2)

#### SATER Confidence-Aware Routing

- **Source:** [arxiv-2510.05164](https://arxiv.org/abs/2510.05164)
- **Key Metrics:** 50%+ cost reduction, 80%+ cascade latency reduction
- **Integration Point:** `packages/nexus-agents/src/agents/experts/expert-selector.ts`
- **GitHub Issue:** #99

Dual-mode routing with shortest-response preference optimization and confidence-aware rejection.

#### TOPSIS Multi-Criteria Routing

- **Source:** [arxiv-2509.07571](https://arxiv.org/abs/2509.07571)
- **Key Metrics:** 31.46% cost reduction
- **Integration Point:** `packages/nexus-agents/src/agents/experts/expert-selector.ts`

Multi-criteria decision algorithm for Pareto-optimal model selection (performance vs cost).

#### Agreement-Based Cascading (ABC)

- **Source:** [arxiv-2507.00672](https://arxiv.org/abs/2507.00672)
- **Integration Point:** `packages/nexus-agents/src/adapters/`

Cascade of increasingly powerful models with ensemble agreement at each stage. Escalate only when agreement threshold not met.

## Implementation Status

**Completed (v2.2.0 - Epic #164):**

- ✅ CompositeRouter chains Budget→TOPSIS→LinUCB
- ✅ BudgetRouter with session budget tracking
- ✅ TopsisRouter for multi-criteria optimization
- ✅ LinUCBBandit for contextual bandit selection
- ✅ AgreementCascadeRouter for ensemble agreement
- ✅ FeedbackIntegration for closed-loop learning
- ✅ CliDetectionCache for health check caching

**Planned (v2.3.0+):**

- IPR quality estimators (lightweight quality prediction)
- RouteLLM preference training (requires training data collection)
- SATER confidence-aware rejection (partial via cascade)

## Related Topics

- [CLI Tools](../cli-tools/README.md) - CLI adapter routing
- [Orchestration](../orchestration/README.md) - Task distribution

## References

- [IPR: Intelligent Prompt Routing](https://arxiv.org/abs/2509.06274)
- [PILOT: Preference-Prior Routing](https://arxiv.org/abs/2508.21141)
- [SATER: Dual-Mode Routing](https://arxiv.org/abs/2510.05164)
- [MoMA: Generalized Routing](https://arxiv.org/abs/2509.07571)
- [RouteLLM: Learning to Route](https://arxiv.org/abs/2406.18665)
