# Consensus Protocols

**Last Updated:** 2026-01-07 (ET)
**Status:** Active Research

---

## Overview

Research on multi-agent consensus mechanisms for coordinating decision-making across multiple AI agents. Key focus areas include formal consensus protocols, voting mechanisms, Byzantine fault tolerance, and task-aware protocol selection.

## Key Papers

| Paper                                                                | Key Contribution                                                 | Priority | Status      |
| -------------------------------------------------------------------- | ---------------------------------------------------------------- | -------- | ----------- |
| [Aegean](https://arxiv.org/abs/2512.20184)                           | Formal consensus with incremental quorum, 20x latency reduction  | P1       | planned     |
| [Voting or Consensus](https://arxiv.org/abs/2502.19130)              | Task-type protocol selection (+13.2% reasoning, +2.8% knowledge) | P1       | planned     |
| [MAR](https://arxiv.org/abs/2512.20845)                              | Multi-agent reflexion for cross-agent critique                   | P1       | planned     |
| [CP-WBFT](https://arxiv.org/abs/2511.10400)                          | Byzantine fault tolerance with 85.7% fault rate tolerance        | P2       | planned     |
| [Free-MAD](https://arxiv.org/abs/2509.11035)                         | Anti-conformity scoring to prevent majority influence            | P2       | not-started |
| [Multi-Agent Collaboration Survey](https://arxiv.org/abs/2501.06322) | Taxonomy of coordination strategies                              | -        | not-started |

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

## Implementation Roadmap

1. **Phase 1 (v2.3.0):** Aegean consensus, task-aware protocol selection
2. **Phase 2 (v2.4.0):** MAR cross-agent critique, Free-MAD scoring
3. **Phase 3 (v3.0.0):** CP-WBFT Byzantine fault tolerance

## Related Topics

- [Orchestration](../orchestration/README.md) - Agent coordination patterns
- [Memory](../memory/README.md) - Context for consensus decisions

## References

- [Aegean: Formal Consensus for Stochastic Reasoning](https://arxiv.org/abs/2512.20184)
- [Voting or Consensus? Decision-Making in Multi-Agent Debate](https://arxiv.org/abs/2502.19130)
- [MAR: Multi-Agent Reflexion](https://arxiv.org/abs/2512.20845)
- [CP-WBFT: Byzantine Fault Tolerant Consensus](https://arxiv.org/abs/2511.10400)
- [Free-MAD: Score-Based Decision](https://arxiv.org/abs/2509.11035)
