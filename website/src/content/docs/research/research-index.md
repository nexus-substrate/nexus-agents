---
title: Research Foundation
description: Academic research papers and techniques implemented in Nexus Agents
---

Nexus Agents is built on a foundation of peer-reviewed research from leading AI labs. We track 56 papers across 6 research topics and have implemented 25 of 27 extracted techniques.

## Research Statistics

| Category               | Count |
| ---------------------- | ----- |
| Total Papers Reviewed  | 56    |
| Techniques Extracted   | 27    |
| Techniques Implemented | 25    |
| Techniques Remaining   | 1     |
| Techniques Rejected    | 1     |

## Research Topics

| Topic                            | Papers | Techniques | Focus Area                          |
| -------------------------------- | ------ | ---------- | ----------------------------------- |
| [Consensus](/research/consensus) | 6      | 5          | Multi-agent decision protocols      |
| [Routing](/research/routing)     | 11     | 6          | Cost-efficient model routing        |
| [Memory](/research/memory)       | 13     | 6          | Context and long-term memory        |
| Code Generation                  | 16     | 6          | Self-improvement and skill learning |
| Orchestration                    | 14     | 4          | Multi-agent coordination            |
| CLI Tools                        | 0      | 0          | External CLI integration            |

## Implementation Coverage

The chart below shows our implementation progress by priority level:

| Priority | Definition                           | Implemented | Total |
| -------- | ------------------------------------ | ----------- | ----- |
| P1       | High impact, direct architecture fit | 8           | 8     |
| P2       | Medium impact, moderate changes      | 16          | 16    |
| P3       | Lower impact, significant changes    | 1           | 1     |
| P4       | Infrastructure-level, long-term      | 0           | 1     |
| Rejected | Not compatible with architecture     | 1           | 1     |

## Priority 1 Techniques (All Implemented)

These high-impact techniques are fully integrated into Nexus Agents.

| Technique                                                           | Topic           | Key Metrics                                      | Issue                                                               |
| ------------------------------------------------------------------- | --------------- | ------------------------------------------------ | ------------------------------------------------------------------- |
| [Aegean Consensus Protocol](https://arxiv.org/abs/2512.20184)       | consensus       | 1.2x-20x latency reduction, 4.4x token reduction | [#119](https://github.com/williamzujkowski/nexus-agents/issues/119) |
| [Task-Type Protocol Selection](https://arxiv.org/abs/2502.19130)    | consensus       | +13.2% reasoning, +2.8% knowledge                | [#125](https://github.com/williamzujkowski/nexus-agents/issues/125) |
| [Multi-Agent Reflexion (MAR)](https://arxiv.org/abs/2512.20845)     | consensus       | Significant reasoning improvements               | -                                                                   |
| [IPR Quality-Constrained Routing](https://arxiv.org/abs/2509.06274) | routing         | 43.9% cost reduction, sub-150ms latency          | [#128](https://github.com/williamzujkowski/nexus-agents/issues/128) |
| [A-MEM Agentic Memory](https://arxiv.org/abs/2502.12110)            | memory          | Automatic attribute extraction and linking       | [#122](https://github.com/williamzujkowski/nexus-agents/issues/122) |
| [TRINITY Roles](https://arxiv.org/abs/2512.04695)                   | orchestration   | 86.2% on LiveCodeBench                           | [#141](https://github.com/williamzujkowski/nexus-agents/issues/141) |
| [Self-Refine Loop](https://arxiv.org/abs/2303.17651)                | code-generation | 20% average improvement                          | [#126](https://github.com/williamzujkowski/nexus-agents/issues/126) |
| [Reflexion Verbal RL](https://arxiv.org/abs/2303.11366)             | code-generation | +22% ALFWorld, 91% HumanEval                     | [#130](https://github.com/williamzujkowski/nexus-agents/issues/130) |

## Priority 2 Techniques (All Implemented)

Medium-impact techniques providing cost optimization and enhanced capabilities.

| Technique                                                             | Topic           | Key Metrics                              | Issue                                                               |
| --------------------------------------------------------------------- | --------------- | ---------------------------------------- | ------------------------------------------------------------------- |
| [CP-WBFT Byzantine Consensus](https://arxiv.org/abs/2511.10400)       | consensus       | 85.7% fault tolerance                    | [#103](https://github.com/williamzujkowski/nexus-agents/issues/103) |
| [Free-MAD Anti-Conformity](https://arxiv.org/abs/2509.11035)          | consensus       | Enhanced robustness against attacks      | [#152](https://github.com/williamzujkowski/nexus-agents/issues/152) |
| [TOPSIS Multi-Criteria Routing](https://arxiv.org/abs/2509.07571)     | routing         | 31.46% cost reduction                    | [#146](https://github.com/williamzujkowski/nexus-agents/issues/146) |
| [PILOT Budget-Constrained Routing](https://arxiv.org/abs/2508.21141)  | routing         | Adaptive budget handling                 | [#102](https://github.com/williamzujkowski/nexus-agents/issues/102) |
| [SATER Confidence-Aware Routing](https://arxiv.org/abs/2510.05164)    | routing         | 50%+ cost, 80%+ latency reduction        | [#99](https://github.com/williamzujkowski/nexus-agents/issues/99)   |
| [Agreement-Based Cascading](https://arxiv.org/abs/2410.10347)         | routing         | Significant cost optimization            | [#121](https://github.com/williamzujkowski/nexus-agents/issues/121) |
| [RouteLLM Preference Routing](https://arxiv.org/abs/2406.18665)       | routing         | 2x cost reduction                        | [#148](https://github.com/williamzujkowski/nexus-agents/issues/148) |
| [Mem0 Long-Term Memory](https://arxiv.org/abs/2504.19413)             | memory          | 91% latency reduction, 90% token savings | [#156](https://github.com/williamzujkowski/nexus-agents/issues/156) |
| [MIRIX Six-Type Memory](https://arxiv.org/abs/2507.07957)             | memory          | +35% vs RAG, 99.9% storage reduction     | [#157](https://github.com/williamzujkowski/nexus-agents/issues/157) |
| [MobiMem Post-Deployment Evolution](https://arxiv.org/abs/2512.15784) | memory          | 280x faster than GraphRAG                | [#149](https://github.com/williamzujkowski/nexus-agents/issues/149) |
| [Adaptive Memory](https://arxiv.org/abs/2310.08560)                   | memory          | Configurable priority scoring            | [#143](https://github.com/williamzujkowski/nexus-agents/issues/143) |
| [LATTS Adaptive Test-Time Compute](https://arxiv.org/abs/2509.20368)  | orchestration   | 1B model matches 405B                    | [#153](https://github.com/williamzujkowski/nexus-agents/issues/153) |
| [Voyager Skill Library](https://arxiv.org/abs/2305.16291)             | code-generation | 3.3x more unique items, 15.3x faster     | [#150](https://github.com/williamzujkowski/nexus-agents/issues/150) |
| [SICA Self-Improving Agent](https://arxiv.org/abs/2504.15228)         | code-generation | 17% to 53% on SWE-bench                  | [#151](https://github.com/williamzujkowski/nexus-agents/issues/151) |
| [Constitutional AI Self-Critique](https://arxiv.org/abs/2212.08073)   | code-generation | Scales without human labelers            | [#147](https://github.com/williamzujkowski/nexus-agents/issues/147) |

## Remaining Technique

One technique remains in the backlog due to infrastructure requirements:

| Technique                                                   | Topic         | Priority | Reason                              |
| ----------------------------------------------------------- | ------------- | -------- | ----------------------------------- |
| [RL-Trained Orchestrator](https://arxiv.org/abs/2505.19591) | orchestration | P4       | Requires RL training infrastructure |

## Rejected Technique

One technique was evaluated and rejected for architectural reasons:

| Technique                                                          | Topic         | Reason                                                                |
| ------------------------------------------------------------------ | ------------- | --------------------------------------------------------------------- |
| [LatentMAS Latent Space Sharing](https://arxiv.org/abs/2511.20639) | orchestration | Requires same-model agents; incompatible with hybrid CLI architecture |

## Research Registry

All research is tracked in structured YAML files:

- **papers.yaml** - 56 papers with metadata, summaries, and key findings
- **techniques.yaml** - 27 techniques with implementation status and decision history
- **sources.yaml** - Product documentation and non-paper sources

## Contributing Research

See the [Contributing Guide](/research/contributing) for instructions on adding new papers and techniques to the registry.

## Topic Deep Dives

- [Consensus Protocols](/research/consensus) - Aegean, CP-WBFT, MAR, Free-MAD
- [Model Routing](/research/routing) - PILOT, TOPSIS, RouteLLM, SATER, ABC
- [Memory Systems](/research/memory) - Mem0, MIRIX, MobiMem, A-MEM

## References

All papers are available on arXiv. Key foundational papers:

1. [Aegean: Formal Consensus for Stochastic Reasoning](https://arxiv.org/abs/2512.20184) - Consensus protocol foundation
2. [PILOT: Budget-Constrained Routing](https://arxiv.org/abs/2508.21141) - Routing architecture
3. [Mem0: Scalable Long-Term Memory](https://arxiv.org/abs/2504.19413) - Memory system design
4. [TRINITY: Evolved LLM Coordinator](https://arxiv.org/abs/2512.04695) - Orchestration pattern
5. [Self-Refine: Iterative Refinement](https://arxiv.org/abs/2303.17651) - Self-improvement loop
