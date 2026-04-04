# Consensus Protocols

**Last Updated:** 2026-04-03 (ET)
**Status:** Active Research

---

## Overview

Research on multi-agent consensus mechanisms for coordinating decision-making across multiple AI agents. Key focus areas include formal consensus protocols, voting mechanisms, Byzantine fault tolerance, and task-aware protocol selection.

## Key Papers

| Paper                                                                | Key Contribution                                                 | Priority | Status      |
| -------------------------------------------------------------------- | ---------------------------------------------------------------- | -------- | ----------- |
| [Aegean](https://arxiv.org/abs/2512.20184)                           | Formal consensus with incremental quorum, 20x latency reduction  | P1       | implemented |
| [Voting or Consensus](https://arxiv.org/abs/2502.19130)              | Task-type protocol selection (+13.2% reasoning, +2.8% knowledge) | P1       | implemented |
| [MAR](https://arxiv.org/abs/2512.20845)                              | Multi-agent reflexion for cross-agent critique                   | P1       | implemented |
| [CP-WBFT](https://arxiv.org/abs/2511.10400)                          | Byzantine fault tolerance with 85.7% fault rate tolerance        | P2       | implemented |
| [Free-MAD](https://arxiv.org/abs/2509.11035)                         | Anti-conformity scoring to prevent majority influence            | P2       | implemented |
| [Multi-Agent Collaboration Survey](https://arxiv.org/abs/2501.06322) | Taxonomy of coordination strategies                              | -        | not-started |

> **Note:** The techniques registry contains 6 consensus techniques (including Higher-Order Voting, arxiv-2510.01499); this table covers 5 of them plus the survey paper. The registry is the authoritative source.

## Recommended Techniques

### High Priority (P1)

#### Aegean Consensus Protocol

- **Source:** [arxiv-2512.20184](https://arxiv.org/abs/2512.20184)
- **Key Metrics:** 1.2x-20x latency reduction, 4.4x token reduction
- **Integration Point:** `packages/nexus-agents/src/agents/collaboration/consensus-protocol.ts`
- **GitHub Issue:** #100

Formal consensus protocol for stochastic reasoning with incremental quorum detection. Direct replacement for current heuristic consensus with early termination when quorum is reached.

#### Task-Aware Protocol Selection

- **Source:** [arxiv-2502.19130](https://arxiv.org/abs/2502.19130)
- **Key Metrics:** +13.2% on reasoning tasks, +2.8% on knowledge tasks
- **Integration Point:** `packages/nexus-agents/src/agents/collaboration/consensus-protocol.ts`

Select between voting (reasoning) and consensus (knowledge) protocols based on task type classification. Low complexity, high impact improvement.

#### Multi-Agent Reflexion (MAR)

- **Source:** [arxiv-2512.20845](https://arxiv.org/abs/2512.20845)
- **Key Metrics:** Significant reasoning improvements
- **Integration Point:** `packages/nexus-agents/src/agents/collaboration/collaboration-space.ts`

Cross-agent critique within collaboration spaces for diverse perspectives and consensus through multi-agent evaluation.

### Medium Priority (P2)

#### CP-WBFT Byzantine Fault Tolerance

- **Source:** [arxiv-2511.10400](https://arxiv.org/abs/2511.10400)
- **Key Metrics:** 85.7% fault rate tolerance
- **Integration Point:** `packages/nexus-agents/src/agents/collaboration/result-aggregator.ts`
- **GitHub Issue:** #103

Confidence probe-based weighted voting for Byzantine fault tolerance in expert collaboration.

## Implementation Status

All planned consensus techniques are **implemented**:

- Aegean consensus protocol (`aegean-protocol.ts`)
- Task-aware protocol selection (`adaptive-protocol-selector.ts`)
- Multi-Agent Reflexion / MAR (`reflexion-protocol.ts`)
- CP-WBFT Byzantine fault tolerance (`result-aggregator.ts`)
- Free-MAD anti-conformity scoring (`free-mad-scoring.ts`)
- Higher-Order Voting / OW+ISP (`higher-order-voting.ts`)

## Related Topics

- [Orchestration](../orchestration/README.md) - Agent coordination patterns
- [Memory](../memory/README.md) - Context for consensus decisions

## References

- [Aegean: Formal Consensus for Stochastic Reasoning](https://arxiv.org/abs/2512.20184)
- [Voting or Consensus? Decision-Making in Multi-Agent Debate](https://arxiv.org/abs/2502.19130)
- [MAR: Multi-Agent Reflexion](https://arxiv.org/abs/2512.20845)
- [CP-WBFT: Byzantine Fault Tolerant Consensus](https://arxiv.org/abs/2511.10400)
- [Free-MAD: Score-Based Decision](https://arxiv.org/abs/2509.11035)
