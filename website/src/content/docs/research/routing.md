---
title: Model Routing
description: Research-backed intelligent routing of tasks to optimal models
---

Research on intelligent routing of tasks to optimal models based on cost, quality, and latency constraints. All 6 routing techniques have been implemented and unified via the CompositeRouter.

## Implementation Status

| Technique                            | Paper                                                | Priority | Status      | Issue                                                               |
| ------------------------------------ | ---------------------------------------------------- | -------- | ----------- | ------------------------------------------------------------------- |
| IPR Quality-Constrained Routing      | [arXiv:2509.06274](https://arxiv.org/abs/2509.06274) | P1       | Implemented | [#128](https://github.com/williamzujkowski/nexus-agents/issues/128) |
| PILOT Budget-Constrained Routing     | [arXiv:2508.21141](https://arxiv.org/abs/2508.21141) | P2       | Implemented | [#102](https://github.com/williamzujkowski/nexus-agents/issues/102) |
| TOPSIS Multi-Criteria Routing        | [arXiv:2509.07571](https://arxiv.org/abs/2509.07571) | P2       | Implemented | [#146](https://github.com/williamzujkowski/nexus-agents/issues/146) |
| SATER Confidence-Aware Routing       | [arXiv:2510.05164](https://arxiv.org/abs/2510.05164) | P2       | Implemented | [#99](https://github.com/williamzujkowski/nexus-agents/issues/99)   |
| Agreement-Based Cascading (ABC)      | [arXiv:2410.10347](https://arxiv.org/abs/2410.10347) | P2       | Implemented | [#121](https://github.com/williamzujkowski/nexus-agents/issues/121) |
| Preference-Trained Router (RouteLLM) | [arXiv:2406.18665](https://arxiv.org/abs/2406.18665) | P2       | Implemented | [#148](https://github.com/williamzujkowski/nexus-agents/issues/148) |

## Routing Architecture

All routing techniques are unified through the `CompositeRouter` which chains three stages:

```
Task → BudgetRouter → TopsisRouter → LinUCBBandit → Selected Model
         (filter)       (rank)          (learn)
```

### Stage 1: Budget Filter

Enforces token, cost, and latency constraints. Models that exceed budget are filtered out.

### Stage 2: TOPSIS Ranking

Multi-criteria ranking using quality, cost, and latency weights. Returns Pareto-optimal model selection.

### Stage 3: LinUCB Selection

Contextual bandit that learns from task outcomes. Balances exploration vs exploitation.

## IPR Quality-Constrained Routing

**Paper:** [IPR: Intelligent Prompt Routing](https://arxiv.org/abs/2509.06274)

Quality-constrained routing with user-controlled tolerance parameter and lightweight estimators. Routes to the cheapest model that meets the quality threshold.

### Key Metrics

| Metric          | Value     |
| --------------- | --------- |
| Cost Reduction  | 43.9%     |
| Routing Latency | Sub-150ms |

### Implementation

Implemented as `QualityRouter` class with `TaskComplexityEstimator`:

- Task complexity estimation (5 factors: length, structure, domain, reasoning, tools)
- Quality/cost trade-off optimization for CLI adapters
- Sub-150ms routing latency achieved
- 22 comprehensive tests

**Source Files:**

- `src/adapters/quality-router.ts`
- `src/adapters/complexity-estimator.ts`

### Usage

```typescript
import { QualityRouter } from 'nexus-agents';

const router = new QualityRouter({
  qualityThreshold: 0.8,
  costWeight: 0.3,
});

const model = await router.route(task);
```

## PILOT Budget-Constrained Routing

**Paper:** [PILOT: Preference-Prior Routing with Budget Constraints](https://arxiv.org/abs/2508.21141)

Contextual bandit (LinUCB) with preference-prior routing and multi-choice knapsack budget constraints.

### Key Metrics

| Metric          | Value                            |
| --------------- | -------------------------------- |
| Budget Handling | Adaptive to diverse requirements |

### Implementation

Full PILOT Budget-Constrained Routing implemented:

- LinUCB contextual bandit (462 lines) with 6-feature context
- Token, cost, and latency budget enforcement
- Session budget tracking with auto-reset
- Budget warnings at configurable thresholds
- 3-stage CompositeRouter: Budget → TOPSIS → LinUCB
- Comprehensive test coverage (43+ budget tests, 40+ LinUCB tests)

**Source Files:**

- `src/cli-adapters/budget-router.ts`
- `src/cli-adapters/linucb-bandit.ts`
- `src/cli-adapters/composite-router.ts`
- `src/cli-adapters/budget-utils.ts`

### Usage

```typescript
import { BudgetRouter } from 'nexus-agents';

const router = new BudgetRouter({
  tokenBudget: 1_000_000,
  costBudgetUsd: 10.0,
  resetIntervalMs: 3600000, // 1 hour
});

const result = await router.routeWithBudget(task, {
  maxTokens: 100_000,
  maxCostUsd: 1.0,
});
```

## TOPSIS Multi-Criteria Routing

**Paper:** [MoMA: Towards Generalized Routing](https://arxiv.org/abs/2509.07571)

Multi-criteria decision algorithm for Pareto-optimal model selection balancing performance vs cost.

### Key Metrics

| Metric         | Value  |
| -------------- | ------ |
| Cost Reduction | 31.46% |

### Implementation

Implemented `TopsisRouter` with:

- Vector normalization of decision matrix
- Configurable criteria weights (quality, cost, latency)
- Positive/negative ideal solution calculation
- Closeness score ranking
- Cost savings estimation vs highest quality model
- 22 comprehensive tests

**Source Files:**

- `src/cli-adapters/topsis-router.ts`
- `src/cli-adapters/topsis-types.ts`

### Usage

```typescript
import { TopsisRouter } from 'nexus-agents';

const router = new TopsisRouter({
  weights: {
    quality: 0.5,
    cost: 0.3,
    latency: 0.2,
  },
});

const ranked = router.rank(task, availableModels);
```

## SATER Confidence-Aware Routing

**Paper:** [SATER: Dual-Mode Routing with Confidence-Aware Rejection](https://arxiv.org/abs/2510.05164)

Dual-mode routing with shortest-response preference optimization and confidence-aware rejection.

### Key Metrics

| Metric                    | Value |
| ------------------------- | ----- |
| Cost Reduction            | 50%+  |
| Cascade Latency Reduction | 80%+  |

### Implementation

Implemented confidence-aware cascade routing with confidence estimation before model escalation.

**Source Files:**

- `src/adapters/`
- `src/agents/experts/expert-selector.ts`

### Usage

```typescript
import { CascadeRouter } from 'nexus-agents';

const router = new CascadeRouter({
  confidenceThreshold: 0.85,
  stages: ['haiku', 'sonnet', 'opus'],
});

const result = await router.route(task);
```

## Agreement-Based Cascading (ABC)

**Paper:** [Edge Multi-LLM: Hybrid Routing with Cascade/ABC Patterns](https://arxiv.org/abs/2507.00672)

Cascade of increasingly powerful models with ensemble agreement at each stage. Escalate only when agreement threshold not met.

### Key Metrics

| Metric            | Value       |
| ----------------- | ----------- |
| Cost Optimization | Significant |

### Implementation

Implemented `AgreementCascadeRouter` class with:

- Multi-model execution at each cascade stage
- Jaccard similarity-based response clustering
- Configurable agreement thresholds (default 0.7)
- Cost savings tracking for early resolution
- 14 comprehensive tests

**Source Files:**

- `src/cli-adapters/agreement-cascade-router.ts`

### Usage

```typescript
import { AgreementCascadeRouter } from 'nexus-agents';

const router = new AgreementCascadeRouter({
  agreementThreshold: 0.7,
  stages: [
    { models: ['haiku-1', 'haiku-2'], costPerToken: 0.001 },
    { models: ['sonnet'], costPerToken: 0.01 },
  ],
});

const result = await router.route(task);
```

## Preference-Trained Router (RouteLLM)

**Paper:** [RouteLLM: Learning to Route LLMs with Preference Data](https://arxiv.org/abs/2406.18665)

Train router on human preference data for dynamic selection between strong/weak LLM. Transfer learning maintains performance.

### Key Metrics

| Metric         | Value |
| -------------- | ----- |
| Cost Reduction | 2x    |

### Implementation

Implemented `PreferenceRouter` with preference-based model selection using historical preference data for routing decisions.

**Source Files:**

- `src/cli-adapters/preference-router.ts`
- `src/cli-adapters/preference-router-types.ts`

### Usage

```typescript
import { PreferenceRouter } from 'nexus-agents';

const router = new PreferenceRouter({
  preferenceData: loadedPreferences,
  strongModel: 'opus',
  weakModel: 'haiku',
});

const model = await router.route(task);
```

## Composite Router

All routing techniques are unified through the `CompositeRouter`:

```typescript
import { CompositeRouter } from 'nexus-agents';

const router = new CompositeRouter({
  budget: {
    tokenBudget: 1_000_000,
    costBudgetUsd: 10.0,
  },
  topsis: {
    qualityWeight: 0.5,
    costWeight: 0.3,
    latencyWeight: 0.2,
  },
  linucb: {
    alpha: 1.0, // Exploration parameter
  },
});

// Route with full pipeline
const decision = await router.route(task);

// Decision includes:
// - cliName: Selected model
// - confidence: Routing confidence
// - reason: Why this model was chosen
// - alternatives: Fallback options
// - stagesExecuted: Which stages ran
```

## Debug Routing Decisions

Use the `routing-audit` CLI command to debug routing decisions:

```bash
# Dry-run routing for a task
nexus-agents routing-audit "Implement a sorting algorithm" --format=json
```

Output shows:

- Task profile analysis
- Budget filter results
- TOPSIS scores per CLI
- LinUCB selection with UCB scores
- Feature importance analysis

## Source Papers

| Paper                                              | Year | Key Contribution            |
| -------------------------------------------------- | ---- | --------------------------- |
| [RouteLLM](https://arxiv.org/abs/2406.18665)       | 2024 | Preference-trained routing  |
| [IPR](https://arxiv.org/abs/2509.06274)            | 2025 | Quality-constrained routing |
| [PILOT](https://arxiv.org/abs/2508.21141)          | 2025 | Budget-constrained routing  |
| [SATER](https://arxiv.org/abs/2510.05164)          | 2025 | Confidence-aware routing    |
| [MoMA](https://arxiv.org/abs/2509.07571)           | 2025 | TOPSIS multi-criteria       |
| [Edge Multi-LLM](https://arxiv.org/abs/2507.00672) | 2025 | Agreement-based cascading   |

## Related Topics

- [CLI Adapters](/architecture/cli-adapters) - External CLI integration
- [Consensus](/research/consensus) - Decision protocols
