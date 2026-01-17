---
title: Consensus Protocols
description: Multi-agent decision-making protocols implemented in Nexus Agents
---

Research on multi-agent consensus mechanisms for coordinating decision-making across multiple AI agents. All 5 consensus techniques have been implemented.

## Implementation Status

| Technique                    | Paper                                                | Priority | Status      | Issue                                                               |
| ---------------------------- | ---------------------------------------------------- | -------- | ----------- | ------------------------------------------------------------------- |
| Aegean Consensus Protocol    | [arXiv:2512.20184](https://arxiv.org/abs/2512.20184) | P1       | Implemented | [#119](https://github.com/williamzujkowski/nexus-agents/issues/119) |
| Task-Type Protocol Selection | [arXiv:2502.19130](https://arxiv.org/abs/2502.19130) | P1       | Implemented | [#125](https://github.com/williamzujkowski/nexus-agents/issues/125) |
| Multi-Agent Reflexion (MAR)  | [arXiv:2512.20845](https://arxiv.org/abs/2512.20845) | P1       | Implemented | -                                                                   |
| CP-WBFT Byzantine Consensus  | [arXiv:2511.10400](https://arxiv.org/abs/2511.10400) | P2       | Implemented | [#103](https://github.com/williamzujkowski/nexus-agents/issues/103) |
| Free-MAD Anti-Conformity     | [arXiv:2509.11035](https://arxiv.org/abs/2509.11035) | P2       | Implemented | [#152](https://github.com/williamzujkowski/nexus-agents/issues/152) |

## Aegean Consensus Protocol

**Paper:** [Aegean: Formal Consensus for Stochastic Reasoning](https://arxiv.org/abs/2512.20184)

Formal consensus protocol for stochastic reasoning with incremental quorum detection. Achieves significant performance improvements while maintaining quality.

### Key Metrics

| Metric            | Value                   |
| ----------------- | ----------------------- |
| Latency Reduction | 1.2x - 20x              |
| Token Reduction   | 4.4x                    |
| Quality Impact    | Within 2.5% of baseline |

### Implementation

Implemented as `AegeanProtocol` class with:

- Leader-based coordination with round-robin selection
- Incremental quorum detection for early termination
- Byzantine fault tolerance (tolerates f faults out of 3f+1 agents)
- Full test coverage (23 tests)

**Source Files:**

- `src/agents/collaboration/aegean-types.ts`
- `src/agents/collaboration/aegean-protocol.ts`

### Usage

```typescript
import { AegeanProtocol } from 'nexus-agents';

const protocol = new AegeanProtocol({
  agents: ['agent-1', 'agent-2', 'agent-3', 'agent-4'],
  quorumThreshold: 0.67,
  maxRounds: 5,
});

const result = await protocol.execute(task);
```

## Task-Type Protocol Selection

**Paper:** [Voting or Consensus? Decision-Making in Multi-Agent Debate](https://arxiv.org/abs/2502.19130)

Empirically determined that voting works better for reasoning tasks while consensus works better for knowledge tasks. Automatic protocol selection based on task classification.

### Key Metrics

| Task Type       | Improvement |
| --------------- | ----------- |
| Reasoning Tasks | +13.2%      |
| Knowledge Tasks | +2.8%       |

### Implementation

Implemented `TaskTypeClassifier` and `AdaptiveProtocolSelector`:

- Keyword-based task classification (reasoning vs knowledge)
- Automatic protocol selection based on task type
- Configurable pattern mapping
- 31 comprehensive tests

**Source Files:**

- `src/agents/collaboration/task-type-classifier.ts`
- `src/agents/collaboration/adaptive-protocol-selector.ts`

### Usage

```typescript
import { AdaptiveProtocolSelector } from 'nexus-agents';

const selector = new AdaptiveProtocolSelector();
const protocol = selector.selectProtocol(task);

// Returns 'voting' for reasoning tasks, 'consensus' for knowledge tasks
```

## Multi-Agent Reflexion (MAR)

**Paper:** [MAR: Multi-Agent Reflexion Improves Reasoning Abilities](https://arxiv.org/abs/2512.20845)

Multiple agents reflect and critique each other's outputs for improved reasoning through cross-agent evaluation. Avoids "degeneration of thought" from single-agent self-reflection.

### Key Metrics

| Metric                | Value                         |
| --------------------- | ----------------------------- |
| Reasoning Improvement | Significant across benchmarks |

### Implementation

Implemented as `ReflexionProtocol` class with:

- Persona-based multi-agent debates
- Weighted severity scoring
- Iterative critique and synthesis rounds
- Default code review personas (security, performance, maintainability, correctness)

**Source Files:**

- `src/agents/collaboration/reflexion-types.ts`
- `src/agents/collaboration/reflexion-protocol.ts`

### Usage

```typescript
import { ReflexionProtocol } from 'nexus-agents';

const protocol = new ReflexionProtocol({
  personas: ['security-critic', 'performance-critic', 'maintainability-critic'],
  maxRounds: 3,
  severityThreshold: 0.3,
});

const result = await protocol.execute(codeReviewTask);
```

## CP-WBFT Byzantine Fault Tolerant Consensus

**Paper:** [CP-WBFT: Confidence Probe-based Weighted Byzantine Fault Tolerant](https://arxiv.org/abs/2511.10400)

Confidence Probe-based Weighted Byzantine Fault Tolerant consensus that handles malicious or faulty agents through weighted voting with heuristic detection of adversarial patterns.

### Key Metrics

| Metric          | Value |
| --------------- | ----- |
| Fault Tolerance | 85.7% |

### Implementation

Implemented weighted Byzantine fault tolerance for expert collaboration:

- Confidence probes for vote weighting
- Pattern detection for adversarial behavior (contrarian voting, collusion)
- Automatic weight adjustment based on historical performance

**Source Files:**

- `src/consensus/weighted-voting.ts`
- `src/agents/collaboration/result-aggregator.ts`

### Usage

```typescript
import { WeightedVoting } from 'nexus-agents';

const voting = new WeightedVoting({
  minTrustScore: 0.3,
  quorumThreshold: 0.67,
  weightDecay: 0.9,
  weightRecovery: 1.05,
});

const result = voting.weightedConsensus(votes);
```

## Free-MAD Anti-Conformity Scoring

**Paper:** [Free-MAD: Score-Based Decision with Anti-Conformity](https://arxiv.org/abs/2509.11035)

Score-based decision with anti-conformity to prevent majority influence on correct answers. Protects minority positions that may be correct.

### Key Metrics

| Metric     | Value                    |
| ---------- | ------------------------ |
| Robustness | Enhanced against attacks |

### Implementation

Implemented as `FreeMadScorer` class with:

- Debate trajectory tracking across multiple rounds
- Anti-conformity scoring with configurable penalty weights
- Persistence bonus for minority position maintainers
- Conformity detection when agents change to match majority
- Integration helpers for existing consensus protocols
- 19 comprehensive tests

**Source Files:**

- `src/agents/collaboration/free-mad-types.ts`
- `src/agents/collaboration/free-mad-scoring.ts`

### Usage

```typescript
import { FreeMadScorer } from 'nexus-agents';

const scorer = new FreeMadScorer({
  conformityPenalty: 0.2,
  persistenceBonus: 0.15,
});

// Track positions across debate rounds
scorer.recordPosition('agent-1', 'round-1', 'position-A');
scorer.recordPosition('agent-2', 'round-1', 'position-B');

// Get anti-conformity adjusted scores
const scores = scorer.getAdjustedScores();
```

## Source Papers

| Paper                                                                              | Year | Key Contribution                |
| ---------------------------------------------------------------------------------- | ---- | ------------------------------- |
| [Multi-Agent Collaboration Mechanisms: A Survey](https://arxiv.org/abs/2501.06322) | 2025 | Taxonomy of collaboration types |
| [Voting or Consensus?](https://arxiv.org/abs/2502.19130)                           | 2025 | Protocol comparison             |
| [Aegean](https://arxiv.org/abs/2512.20184)                                         | 2025 | Formal consensus with quorum    |
| [CP-WBFT](https://arxiv.org/abs/2511.10400)                                        | 2025 | Byzantine fault tolerance       |
| [Free-MAD](https://arxiv.org/abs/2509.11035)                                       | 2025 | Anti-conformity scoring         |
| [MAR](https://arxiv.org/abs/2512.20845)                                            | 2025 | Multi-agent reflexion           |

## Related Topics

- [Orchestration](/architecture/orchestration) - Agent coordination patterns that use consensus
- [Memory Systems](/research/memory) - Context for consensus decisions
