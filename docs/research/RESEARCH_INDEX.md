# Nexus-Agents Research Index

**Generated:** 2026-01-07 (ET)
**Total Papers:** 51 | **Techniques:** 27 | **Topics:** 6

---

## Quick Stats

| Status      | Papers | Techniques |
| ----------- | ------ | ---------- |
| Implemented | 0      | 0          |
| In Progress | 0      | 0          |
| Planned     | 23     | 18         |
| Not Started | 27     | 8          |
| Rejected    | 1      | 1          |

---

## Topics

| Topic                                               | Papers | Techniques | Description                         |
| --------------------------------------------------- | ------ | ---------- | ----------------------------------- |
| [Consensus](topics/consensus/README.md)             | 6      | 5          | Multi-agent decision protocols      |
| [Routing](topics/routing/README.md)                 | 12     | 8          | Cost-efficient model routing        |
| [Memory](topics/memory/README.md)                   | 11     | 5          | Context and long-term memory        |
| [Code Generation](topics/code-generation/README.md) | 14     | 6          | Self-improvement and skill learning |
| [CLI Tools](topics/cli-tools/README.md)             | 3      | 0          | External CLI integration            |
| [Orchestration](topics/orchestration/README.md)     | 10     | 3          | Multi-agent coordination            |

---

## Priority 1 (P1) Techniques

These techniques are high-impact and align well with the current architecture.

| Technique                                                                               | Topic         | Key Metrics                                 | Issue |
| --------------------------------------------------------------------------------------- | ------------- | ------------------------------------------- | ----- |
| [Aegean Consensus](registry/techniques.yaml#aegean-consensus)                           | consensus     | 20x latency reduction, 4.4x token reduction | #100  |
| [Task-Aware Protocol Selection](registry/techniques.yaml#task-aware-protocol-selection) | consensus     | +13.2% reasoning, +2.8% knowledge           | -     |
| [Multi-Agent Reflexion](registry/techniques.yaml#multi-agent-reflexion)                 | consensus     | Cross-agent critique                        | -     |
| [IPR Quality Routing](registry/techniques.yaml#ipr-quality-estimators)                  | routing       | 43.9% cost reduction                        | #102  |
| [PILOT Budget Routing](registry/techniques.yaml#pilot-budget-routing)                   | routing       | Budget-constrained                          | #102  |
| [TRINITY Roles](registry/techniques.yaml#trinity-roles)                                 | orchestration | 86.2% LiveCodeBench                         | -     |
| [Self-Refine Loop](registry/techniques.yaml#self-refine-loop)                           | code-gen      | 20% improvement                             | -     |
| [Reflexion Verbal RL](registry/techniques.yaml#reflexion-verbal-rl)                     | code-gen      | 91% HumanEval                               | -     |

---

## Priority 2 (P2) Techniques

Medium-impact or requiring moderate changes.

| Technique                                                                         | Topic         | Key Metrics              | Issue |
| --------------------------------------------------------------------------------- | ------------- | ------------------------ | ----- |
| [CP-WBFT Consensus](registry/techniques.yaml#cp-wbft-consensus)                   | consensus     | 85.7% fault tolerance    | #103  |
| [SATER Routing](registry/techniques.yaml#sater-routing)                           | routing       | 50%+ cost reduction      | #99   |
| [TOPSIS Routing](registry/techniques.yaml#topsis-routing)                         | routing       | 31.46% cost reduction    | -     |
| [Cascade Routing](registry/techniques.yaml#cascade-routing)                       | routing       | Agreement-based          | -     |
| [Preference-Trained Routing](registry/techniques.yaml#preference-trained-routing) | routing       | 2x cost reduction        | -     |
| [Mem0 Memory](registry/techniques.yaml#mem0-memory-architecture)                  | memory        | 91% latency reduction    | #101  |
| [MIRIX Six-Type Memory](registry/techniques.yaml#mirix-six-type-memory)           | memory        | 35% accuracy improvement | #101  |
| [MobiMem Evolution](registry/techniques.yaml#mobimem-evolution)                   | memory        | 280x faster retrieval    | -     |
| [LATTS Adaptive Compute](registry/techniques.yaml#latts-adaptive-compute)         | orchestration | 1B matches 405B          | -     |
| [Voyager Skill Library](registry/techniques.yaml#voyager-skill-library)           | code-gen      | 15.3x faster milestones  | -     |
| [SICA Self-Improvement](registry/techniques.yaml#sica-self-improvement)           | code-gen      | 17%→53% SWE-Bench        | -     |
| [Constitutional AI](registry/techniques.yaml#constitutional-ai)                   | code-gen      | Scales without humans    | -     |

---

## Recently Reviewed Papers

| Date       | Paper                                             | Topic         | Priority |
| ---------- | ------------------------------------------------- | ------------- | -------- |
| 2026-01-06 | [Aegean](https://arxiv.org/abs/2512.20184)        | consensus     | P1       |
| 2026-01-06 | [MAR](https://arxiv.org/abs/2512.20845)           | consensus     | P1       |
| 2026-01-06 | [TRINITY](https://arxiv.org/abs/2512.04695)       | orchestration | P1       |
| 2026-01-06 | [MobiMem](https://arxiv.org/abs/2512.15784)       | memory        | P2       |
| 2026-01-06 | [Pick and Spin](https://arxiv.org/abs/2512.22402) | orchestration | -        |

---

## Papers by Topic

### Consensus (6 papers)

- [Multi-Agent Collaboration Survey](https://arxiv.org/abs/2501.06322) - Coordination taxonomy
- [Voting or Consensus](https://arxiv.org/abs/2502.19130) - Protocol comparison
- [Aegean](https://arxiv.org/abs/2512.20184) - Formal consensus with quorum
- [CP-WBFT](https://arxiv.org/abs/2511.10400) - Byzantine fault tolerance
- [Free-MAD](https://arxiv.org/abs/2509.11035) - Anti-conformity scoring
- [MAR](https://arxiv.org/abs/2512.20845) - Multi-agent reflexion

### Routing (12 papers)

- [RouteLLM](https://arxiv.org/abs/2406.18665) - Preference-trained routing
- [IPR](https://arxiv.org/abs/2509.06274) - Quality-constrained routing
- [PILOT](https://arxiv.org/abs/2508.21141) - Budget-constrained routing
- [SATER](https://arxiv.org/abs/2510.05164) - Confidence-aware routing
- [MoMA](https://arxiv.org/abs/2509.07571) - TOPSIS multi-criteria
- [OptiRoute](https://arxiv.org/abs/2502.16696) - kNN routing
- [Cross-Attention](https://arxiv.org/abs/2509.09782) - Query-model matching
- [Capability Tuning](https://arxiv.org/abs/2502.17282) - Model zoo coverage
- [Edge Multi-LLM](https://arxiv.org/abs/2507.00672) - Agreement-based cascading
- [STRMAC](https://arxiv.org/abs/2511.02200) - State-aware routing

### Memory (11 papers)

- [Mem0](https://arxiv.org/abs/2504.19413) - Scalable long-term memory
- [MIRIX](https://arxiv.org/abs/2507.07957) - Six-type memory system
- [MobiMem](https://arxiv.org/abs/2512.15784) - Post-deployment evolution
- [BET](https://arxiv.org/abs/2511.23271) - Behavior-equivalent token
- [TreeKV](https://arxiv.org/abs/2501.04987) - Tree-structured cache
- [xKV](https://arxiv.org/abs/2503.18893) - Cross-layer SVD
- [Acon](https://arxiv.org/abs/2510.00615) - Task-specific compression
- [CCF](https://arxiv.org/abs/2509.09199) - Learned compression
- [Context Survey](https://arxiv.org/abs/2507.13334) - Context engineering taxonomy
- [ICAL](https://arxiv.org/abs/2406.14596) - Continual learning
- [Lifelong Learning](https://arxiv.org/abs/2501.07278) - Agent learning roadmap

### Code Generation (14 papers)

- [Self-Refine](https://arxiv.org/abs/2303.17651) - Iterative refinement
- [Reflexion](https://arxiv.org/abs/2303.11366) - Verbal RL
- [LATS](https://arxiv.org/abs/2310.04406) - Tree search with reflection
- [Voyager](https://arxiv.org/abs/2305.16291) - Skill library pattern
- [SICA](https://arxiv.org/abs/2504.15228) - Self-improving agent
- [Godel Agent](https://arxiv.org/abs/2410.04444) - Recursive self-modification
- [Constitutional AI](https://arxiv.org/abs/2212.08073) - Principle-based critique
- [Agent Q](https://arxiv.org/abs/2408.07199) - MCTS + self-critique
- [RLAIF](https://arxiv.org/abs/2309.00267) - AI feedback scaling
- [CycleQD](https://arxiv.org/abs/2410.14735) - Quality-diversity skills
- [EXIF](https://arxiv.org/abs/2506.04287) - Automated skill discovery
- [Test-Time Feedback](https://arxiv.org/abs/2504.01931) - Inference improvement
- [Self-Play](https://arxiv.org/abs/2512.02731) - Theoretical foundations
- [Self-Evolving Survey](https://arxiv.org/abs/2507.21046) - Survey

### Orchestration (10 papers)

- [TRINITY](https://arxiv.org/abs/2512.04695) - Role-based coordinator
- [Evolving Orchestration](https://arxiv.org/abs/2505.19591) - RL-trained orchestrator
- [LATTS](https://arxiv.org/abs/2509.20368) - Adaptive test-time compute
- [Pick and Spin](https://arxiv.org/abs/2512.22402) - Helm deployment
- [Multi-LLM Engine](https://arxiv.org/abs/2410.10039) - Temporal graph
- [AgentsNet](https://arxiv.org/abs/2507.08616) - 100-agent benchmark
- [Hybrid Architectures](https://arxiv.org/abs/2510.04800) - Transformer+SSM
- [LatentMAS](https://arxiv.org/abs/2511.20639) - Latent space sharing (rejected)
- [Multi-AI Optimization](https://arxiv.org/abs/2412.17149) - Five-agent system
- [Meta-Thinking](https://arxiv.org/abs/2504.14520) - Multi-agent RL
- [LLM-MAS Survey](https://arxiv.org/abs/2412.17481) - Multi-agent survey

---

## GitHub Issues

| Issue | Feature                          | Related Papers       |
| ----- | -------------------------------- | -------------------- |
| #99   | Confidence-aware cascade routing | SATER, IPR           |
| #100  | Multi-round voting protocol      | Aegean, Free-MAD     |
| #101  | Typed memory architecture        | MIRIX, Mem0, MobiMem |
| #102  | Budget-constrained routing       | PILOT, IPR           |
| #103  | Weighted Byzantine voting        | CP-WBFT              |
| #124  | Research tracking system         | (this system)        |

---

## Search Tags

`#consensus` `#routing` `#memory` `#cost-optimization` `#multi-agent`
`#self-improvement` `#context-compression` `#graph-memory` `#byzantine`
`#skill-library` `#reflexion` `#mcts` `#verbal-rl` `#cli-tools`
`#mcp` `#claude` `#gemini` `#codex` `#orchestration`

---

## Registry Files

- [papers.yaml](registry/papers.yaml) - All 51 papers with metadata
- [techniques.yaml](registry/techniques.yaml) - All 27 techniques with status
- [sources.yaml](registry/sources.yaml) - Product docs and other sources

---

## How to Contribute

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on adding new research.

---

_Generated from YAML registries. Last updated: 2026-01-07 (ET)_
