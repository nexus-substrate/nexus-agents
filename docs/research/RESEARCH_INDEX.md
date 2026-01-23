# Nexus-Agents Research Index

**Generated:** 2026-01-23 (ET)
**Total Papers:** 68 | **Techniques:** 38 | **Topics:** 6

---

## Quick Stats

| Status      | Papers | Techniques |
| ----------- | ------ | ---------- |
| Implemented | -      | 35         |
| In Progress | -      | 0          |
| Planned     | -      | 1          |
| Not Started | -      | 1          |
| Rejected    | -      | 1          |

> **Note:** Paper-level status tracking deprecated. Technique status is source of truth.

---

## Topics

| Topic                                               | Papers | Techniques | Description                         |
| --------------------------------------------------- | ------ | ---------- | ----------------------------------- |
| [Consensus](topics/consensus/README.md)             | 6      | 6          | Multi-agent decision protocols      |
| [Routing](topics/routing/README.md)                 | 11     | 8          | Cost-efficient model routing        |
| [Memory](topics/memory/README.md)                   | 14     | 7          | Context and long-term memory        |
| [Code Generation](topics/code-generation/README.md) | 16     | 6          | Self-improvement and skill learning |
| [Cli Tools](topics/cli-tools/README.md)             | 0      | 0          | External CLI integration            |
| [Orchestration](topics/orchestration/README.md)     | 14     | 9          | Multi-agent coordination            |
| [Security](topics/security/README.md)               | 2      | 2          | Safety analysis and evaluation      |

---

## Priority 1 (P1) Techniques

These techniques are high-impact and align well with the current architecture.

| Technique                                                                                   | Topic           | Key Metrics                                                                                                                           | Issue |
| ------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| [Aegean Consensus Protocol](registry/techniques.yaml#aegean-consensus)                      | consensus       | latency_reduction: 1.2x-20x, token_reduction: 4.4x, quality_impact: within 2.5% of baseline                                           | #119  |
| [Task-Type Protocol Selection](registry/techniques.yaml#task-aware-protocol-selection)      | consensus       | reasoning_improvement: +13.2%, knowledge_improvement: +2.8%                                                                           | #125  |
| [Multi-Agent Reflexion (MAR)](registry/techniques.yaml#multi-agent-reflexion)               | consensus       | reasoning_improvement: significant across benchmarks                                                                                  | -     |
| [IPR Quality-Constrained Routing](registry/techniques.yaml#ipr-quality-estimators)          | routing         | cost_reduction: 43.9%, latency: sub-150ms                                                                                             | #128  |
| [A-MEM Agentic Memory](registry/techniques.yaml#amem-agentic-memory)                        | memory          | semantic_organization: Automatic attribute extraction and linking, evolution_detection: Refinement, extension, supersession detection | #122  |
| [TRINITY Thinker/Worker/Verifier Roles](registry/techniques.yaml#trinity-roles)             | orchestration   | benchmark_accuracy: 86.2% on LiveCodeBench                                                                                            | #141  |
| [Self-Refine Iterative Loop](registry/techniques.yaml#self-refine-loop)                     | code-generation | average_improvement: 20%                                                                                                              | #126  |
| [Reflexion Verbal Reinforcement Learning](registry/techniques.yaml#reflexion-verbal-rl)     | code-generation | alfworld_improvement: +22%, hotpotqa_improvement: +20%, humaneval_pass1: 91%                                                          | #130  |
| [STPA MCP Framework](registry/techniques.yaml#stpa-mcp-safety)                              | security        | Formal STPA safety analysis for MCP tools                                                                                             | #328  |
| [AFlow MCTS Workflows](registry/techniques.yaml#aflow-mcts-workflows)                       | orchestration   | MCTS-based automatic workflow generation                                                                                              | #329  |
| [SEW Self-Evolving Workflows](registry/techniques.yaml#sew-self-evolving-workflows)         | orchestration   | Self-evolving workflow patterns                                                                                                       | #330  |
| [ZeroRouter Universal Difficulty](registry/techniques.yaml#zerorouter-universal-difficulty) | routing         | Universal difficulty space for routing                                                                                                | #338  |

---

## Priority 2 (P2) Techniques

Medium-impact or requiring moderate changes.

| Technique                                                                                   | Topic           | Key Metrics                                                                                           | Issue |
| ------------------------------------------------------------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------- | ----- |
| [CP-WBFT Byzantine Fault Tolerant Consensus](registry/techniques.yaml#cp-wbft-consensus)    | consensus       | fault_tolerance: 85.7%                                                                                | #103  |
| [Free-MAD Anti-Conformity Scoring](registry/techniques.yaml#free-mad-scoring)               | consensus       | robustness: enhanced against attacks                                                                  | #152  |
| [TOPSIS Multi-Criteria Routing](registry/techniques.yaml#topsis-routing)                    | routing         | cost_reduction: 31.46%                                                                                | #146  |
| [PILOT Budget-Constrained Routing](registry/techniques.yaml#pilot-budget-routing)           | routing         | adaptive: handles diverse budget requirements                                                         | #102  |
| [SATER Confidence-Aware Routing](registry/techniques.yaml#sater-routing)                    | routing         | cost_reduction: 50%+, latency_reduction: 80%+ cascade                                                 | #99   |
| [Agreement-Based Cascading (ABC)](registry/techniques.yaml#cascade-routing)                 | routing         | cost_optimization: significant                                                                        | #121  |
| [Preference-Trained Router (RouteLLM)](registry/techniques.yaml#preference-trained-routing) | routing         | cost_reduction: 2x                                                                                    | #148  |
| [Mem0 Scalable Long-Term Memory](registry/techniques.yaml#mem0-memory-architecture)         | memory          | latency_reduction: 91% lower p95, token_savings: 90%, quality_improvement: 26%                        | #156  |
| [MIRIX Six-Type Memory System](registry/techniques.yaml#mirix-six-type-memory)              | memory          | accuracy_vs_rag: +35%, storage_reduction: 99.9%, benchmark_accuracy: 85.4%                            | #157  |
| [MobiMem Post-Deployment Evolution](registry/techniques.yaml#mobimem-evolution)             | memory          | profile_alignment: 83.1%, retrieval_speed: 280x faster than GraphRAG, task_success_improvement: 50.3% | #149  |
| [Adaptive Memory](registry/techniques.yaml#adaptive-memory)                                 | memory          | performance_improvement: Configurable priority scoring                                                | #143  |
| [LATTS Adaptive Test-Time Compute](registry/techniques.yaml#latts-adaptive-compute)         | orchestration   | performance_parity: 1B model matches 405B                                                             | #153  |
| [Voyager Skill Library Pattern](registry/techniques.yaml#voyager-skill-library)             | code-generation | discovery_improvement: 3.3x more unique items, speed_improvement: up to 15.3x faster milestone        | #150  |
| [SICA Self-Improving Agent](registry/techniques.yaml#sica-self-improvement)                 | code-generation | swebench_improvement: 17% -> 53%, file_editing_improvement: 82% -> 94%                                | #151  |
| [Constitutional AI Self-Critique](registry/techniques.yaml#constitutional-ai)               | code-generation | scales: without human labelers                                                                        | #147  |
| [Higher-Order Voting (OW/ISP)](registry/techniques.yaml#higher-order-voting)                | consensus       | Bayesian-optimal aggregation with correlation awareness                                               | #333  |
| [Forest-of-Thought](registry/techniques.yaml#forest-of-thought)                             | orchestration   | Multi-tree reasoning with sparse activation                                                           | #331  |
| [Agent-SafetyBench](registry/techniques.yaml#agent-safety-bench)                            | security        | Safety evaluation suite integration                                                                   | #332  |
| [DAAO VAE Difficulty](registry/techniques.yaml#daao-difficulty-estimation)                  | routing         | VAE-based difficulty estimation for routing                                                           | #334  |
| [Evolving Orchestration Upgrade](registry/techniques.yaml#evolving-orchestration)           | orchestration   | Puppeteer-style learned orchestration                                                                 | #335  |
| [Hindsight Belief Memory](registry/techniques.yaml#hindsight-belief-memory)                 | memory          | Belief Memory layer for reasoning                                                                     | #336  |
| [Scaling Coordination Predictor](registry/techniques.yaml#scaling-coordination-predictor)   | orchestration   | Coordination predictor for multi-agent scaling                                                        | #337  |

---

## Recently Reviewed Papers

| Date       | Paper                                                                                                         | Topic           | Priority |
| ---------- | ------------------------------------------------------------------------------------------------------------- | --------------- | -------- |
| 2026-01-17 | [STPA MCP Framework](https://arxiv.org/abs/2601.08012)                                                        | security        | P1       |
| 2026-01-17 | [AFlow (MCTS Workflows)](https://arxiv.org/abs/2410.10762)                                                    | orchestration   | P1       |
| 2026-01-17 | [SEW (Self-Evolving Workflows)](https://arxiv.org/abs/2505.18646)                                             | orchestration   | P1       |
| 2026-01-17 | [Higher-Order Voting (OW/ISP)](https://arxiv.org/abs/2510.01499)                                              | consensus       | P2       |
| 2026-01-17 | [Forest-of-Thought](https://arxiv.org/abs/2412.09078)                                                         | orchestration   | P2       |
| 2026-01-17 | [Agent-SafetyBench](https://arxiv.org/abs/2412.14470)                                                         | security        | P2       |
| 2026-01-17 | [DAAO (VAE Difficulty)](https://arxiv.org/abs/2509.11079)                                                     | routing         | P2       |
| 2026-01-17 | [Hindsight (Belief Memory)](https://arxiv.org/abs/2512.12818)                                                 | memory          | P2       |
| 2026-01-17 | [Scaling Agent Systems](https://arxiv.org/abs/2512.08296)                                                     | orchestration   | P2       |
| 2026-01-16 | [Confucius Code Agent: Scalable Agent Scaffolding for Real-World Codebases](https://arxiv.org/abs/2512.10398) | code-generation | -        |

---

## Papers by Topic

### Consensus (6 papers)

- [Multi-Agent Collaboration Mechanisms: A Survey of LLMs](https://arxiv.org/abs/2501.06322) - Taxonomy of collaboration types (cooperation, competition, coopetition)
- [Voting or Consensus? Decision-Making in Multi-Agent Debate](https://arxiv.org/abs/2502.19130) - Empirical comparison of 7 decision protocols for multi-agent systems.
- [Aegean: Formal Consensus Protocol for Stochastic Reasoning](https://arxiv.org/abs/2512.20184) - Formal consensus protocol for stochastic reasoning with
- [CP-WBFT: Confidence Probe-based Weighted Byzantine Fault Tolerant](https://arxiv.org/abs/2511.10400) - Confidence Probe-based Weighted Byzantine Fault Tolerant consensus.
- [Free-MAD: Score-Based Decision with Anti-Conformity](https://arxiv.org/abs/2509.11035) - Score-based decision with anti-conformity to prevent majority
- [MAR: Multi-Agent Reflexion Improves Reasoning Abilities](https://arxiv.org/abs/2512.20845) - Multiple agents reflect and critique each other's outputs.

### Routing (11 papers)

- [RouteLLM: Cost-Quality Routing for LLM Inference](https://arxiv.org/abs/2406.18510) - Quality-constrained routing to cheapest model meeting
- [RouteLLM: Learning to Route LLMs with Preference Data](https://arxiv.org/abs/2406.18665) - Train router on human preference data for dynamic selection
- [OptiRoute](https://arxiv.org/abs/2502.16696) - kNN + hierarchical filtering with cost/ethics tradeoffs.
- [Capability Instruction Tuning](https://arxiv.org/abs/2502.17282) - Achieves 80% GPT-4o coverage with smaller model zoo.
- [MoMA: Towards Generalized Routing](https://arxiv.org/abs/2509.07571) - Unified LLM + agent routing with TOPSIS algorithm for
- [Cross-Attention Routing](https://arxiv.org/abs/2509.09782) - Single-head cross-attention for query-model matching.
- [SATER: Dual-Mode Routing with Confidence-Aware Rejection](https://arxiv.org/abs/2510.05164) - Dual-mode routing with shortest-response preference optimization
- [IPR: Intelligent Prompt Routing](https://arxiv.org/abs/2509.06274) - Quality-constrained routing with user-controlled tolerance parameter
- [PILOT: Preference-Prior Routing with Budget Constraints](https://arxiv.org/abs/2508.21141) - Contextual bandit (LinUCB) with preference-prior routing and
- [STRMAC: State-Aware Routing](https://arxiv.org/abs/2511.02200) - State-aware routing with separate encoding of history and
- [Edge Multi-LLM: Hybrid Routing with Cascade/ABC Patterns](https://arxiv.org/abs/2507.00672) - Hybrid routing with cascade/ABC (Agreement-Based Cascading) patterns.

### Memory (13 papers)

- [Acon: Optimizing Context Compression](https://arxiv.org/abs/2510.00615) - Task-specific context compression techniques.
- [CCF: Context Compression Framework](https://arxiv.org/abs/2509.09199) - Learned compression modules for context management.
- [Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory](https://arxiv.org/abs/2504.19413) - Scalable memory architecture achieving 91% latency reduction
- [Context Engineering Survey](https://arxiv.org/abs/2507.13334) - Taxonomy of context management strategies.
- [xKV: Cross-Layer SVD for KV-Cache Compression](https://arxiv.org/abs/2503.18893) - Cross-layer SVD for KV-cache compression exploiting singular
- [TreeKV: Tree-Structured Cache Compression](https://arxiv.org/abs/2501.04987) - Tree-structured cache compression with smooth context transitions.
- [BET: Behavior-Equivalent Token](https://arxiv.org/abs/2511.23271) - Single-token compression of system prompts via reconstruction
- [A-MEM: Agentic Memory for LLM Agents](https://arxiv.org/abs/2502.12110) - Zettelkasten-inspired agentic memory system where memories are
- [MIRIX: Six-Type Memory System](https://arxiv.org/abs/2507.07957) - Six-type memory system with multi-agent management architecture.
- [MobiMem: Post-Deployment Evolution via Memory Modules](https://arxiv.org/abs/2512.15784) - Post-deployment evolution via Profile, Experience, and Action
- [ICAL: Continual Learning of Multimodal Agents](https://arxiv.org/abs/2406.14596) - Build memory of multimodal experience from suboptimal
- [Lifelong Learning of Large Language Model based Agents: A Roadmap](https://arxiv.org/abs/2501.07278) - Three core modules: Perception (multimodal input), Memory
- [ARIA: Human-in-the-Loop Test-Time Learning](https://arxiv.org/abs/2507.17131) - Agents identify knowledge gaps through self-dialogue, request

### Code Generation (16 papers)

- [MAR: Multi-Agent Reflexion Improves Reasoning Abilities](https://arxiv.org/abs/2512.20845) - Multiple agents reflect and critique each other's outputs.
- [Self-Refine: Iterative Refinement with Self-Feedback](https://arxiv.org/abs/2303.17651) - A single LLM acts as generator, feedback provider, and refiner
- [Reflexion: Language Agents with Verbal Reinforcement Learning](https://arxiv.org/abs/2303.11366) - Agents maintain an episodic memory of verbal reflections that
- [LATS: Language Agent Tree Search](https://arxiv.org/abs/2310.04406) - Combines Monte Carlo Tree Search (MCTS) with LLM-based value
- [Godel Agent: A Self-Referential Agent Framework](https://arxiv.org/abs/2410.04444) - Inspired by Godel machines, agents can modify their own logic
- [SICA: A Self-Improving Coding Agent](https://arxiv.org/abs/2504.15228) - A unified agent that performs tasks AND improves its own
- [Self-Improving AI Agents through Self-Play](https://arxiv.org/abs/2512.02731) - Formalizes self-improvement as a Generator-Verifier-Updater (GVU)
- [Voyager: An Open-Ended Embodied Agent with Large Language Models](https://arxiv.org/abs/2305.16291) - Lifelong learning agent that builds an ever-growing library of
- [CycleQD: Quality-Diversity for Agent Skill Acquisition](https://arxiv.org/abs/2410.14735) - Uses Quality-Diversity framework with cyclic task focus, model
- [EXIF: Automated Skill Discovery for Language Agents](https://arxiv.org/abs/2506.04287) - Exploration-first strategy using two agents (Alice explores,
- [RLAIF vs. RLHF: Scaling Reinforcement Learning with AI Feedback](https://arxiv.org/abs/2309.00267) - RLAIF achieves comparable performance to RLHF at 10x lower cost.
- [Constitutional AI: Harmlessness from AI Feedback](https://arxiv.org/abs/2212.08073) - Two-phase approach: supervised phase (model critiques and revises)
- [Agent Q: Advanced Reasoning and Learning for Autonomous AI Agents](https://arxiv.org/abs/2408.07199) - Combines guided MCTS with self-critique and DPO for learning
- [On the Role of Feedback in Test-Time Scaling of Agentic AI Workflows](https://arxiv.org/abs/2504.01931) - Feedback mechanisms that enable agents to improve during
- [A Survey of Self-Evolving Agents](https://arxiv.org/abs/2507.21046) - Survey of self-evolving agent architectures and techniques.
- [Confucius Code Agent: Scalable Agent Scaffolding for Real-World Codebases](https://arxiv.org/abs/2512.10398) - Production-scale code agent with Confucius SDK. Achieves 54.3% Resolve@1

### Orchestration (14 papers)

- [Multi-Agent Collaboration Mechanisms: A Survey of LLMs](https://arxiv.org/abs/2501.06322) - Taxonomy of collaboration types (cooperation, competition, coopetition)
- [Multi-Agent Collaboration via Evolving Orchestration](https://arxiv.org/abs/2505.19591) - Puppeteer-style paradigm with RL-trained orchestrator for dynamic
- [AgentsNet](https://arxiv.org/abs/2507.08616) - Benchmark for 100-agent coordination scenarios.
- [TRINITY: Evolved LLM Coordinator](https://arxiv.org/abs/2512.04695) - Evolved LLM coordinator with Thinker/Worker/Verifier roles
- [LATTS: Locally Adaptive Test-Time Scaling](https://arxiv.org/abs/2509.20368) - Locally adaptive test-time scaling with verifier-based
- [Hybrid Architectures for LLMs](https://arxiv.org/abs/2510.04800) - Transformer + SSM hybrid analysis.
- [Multi-LLM Orchestration Engine](https://arxiv.org/abs/2410.10039) - Temporal graph + vector DB integration for multi-LLM orchestration.
- [Pick and Spin: Efficient Multi-Model Orchestration](https://arxiv.org/abs/2512.22402) - Unified Helm-based deployment with adaptive scale-to-zero
- [LatentMAS: Direct Latent Space Collaboration](https://arxiv.org/abs/2511.20639) - Direct latent space collaboration through hidden state sharing.
- [LATS: Language Agent Tree Search](https://arxiv.org/abs/2310.04406) - Combines Monte Carlo Tree Search (MCTS) with LLM-based value
- [Multi-AI Agent System for Autonomous Optimization](https://arxiv.org/abs/2412.17149) - Five specialized agents (Refinement, Execution, Evaluation,
- [Meta-Thinking in LLMs via Multi-Agent Reinforcement Learning](https://arxiv.org/abs/2504.14520) - Develop meta-thinking (self-reflection, assessment, control of
- [A Survey on LLM-based Multi-Agent System](https://arxiv.org/abs/2412.17481) - Comprehensive survey on LLM-based multi-agent systems.
- [Confucius Code Agent: Scalable Agent Scaffolding for Real-World Codebases](https://arxiv.org/abs/2512.10398) - Production-scale code agent with Confucius SDK. Achieves 54.3% Resolve@1

---

## GitHub Issues

| Issue | Feature                                    | Related Papers                     |
| ----- | ------------------------------------------ | ---------------------------------- |
| #119  | Aegean Consensus Protocol                  | arxiv-2512.20184                   |
| #125  | Task-Type Protocol Selection               | arxiv-2502.19130                   |
| #103  | CP-WBFT Byzantine Fault Tolerant Consensus | arxiv-2511.10400                   |
| #152  | Free-MAD Anti-Conformity Scoring           | arxiv-2509.11035                   |
| #146  | TOPSIS Multi-Criteria Routing              | arxiv-2509.07571                   |
| #128  | IPR Quality-Constrained Routing            | arxiv-2509.06274, arxiv-2406.18510 |
| #102  | PILOT Budget-Constrained Routing           | arxiv-2508.21141                   |
| #99   | SATER Confidence-Aware Routing             | arxiv-2510.05164                   |
| #121  | Agreement-Based Cascading (ABC)            | arxiv-2410.10347                   |
| #148  | Preference-Trained Router (RouteLLM)       | arxiv-2406.18665                   |
| #156  | Mem0 Scalable Long-Term Memory             | arxiv-2504.19413                   |
| #157  | MIRIX Six-Type Memory System               | arxiv-2507.07957                   |
| #149  | MobiMem Post-Deployment Evolution          | arxiv-2512.15784                   |
| #142  | Graph-Based Memory                         | arxiv-2504.19413                   |
| #143  | Adaptive Memory                            | arxiv-2310.08560                   |
| #122  | A-MEM Agentic Memory                       | arxiv-2502.12110                   |
| #141  | TRINITY Thinker/Worker/Verifier Roles      | arxiv-2512.04695                   |
| #154  | RL-Trained Orchestrator                    | arxiv-2505.19591                   |
| #153  | LATTS Adaptive Test-Time Compute           | arxiv-2509.20368                   |
| #126  | Self-Refine Iterative Loop                 | arxiv-2303.17651                   |
| #130  | Reflexion Verbal Reinforcement Learning    | arxiv-2303.11366                   |
| #150  | Voyager Skill Library Pattern              | arxiv-2305.16291                   |
| #151  | SICA Self-Improving Agent                  | arxiv-2504.15228                   |
| #147  | Constitutional AI Self-Critique            | arxiv-2212.08073                   |
| #131  | Self-Debug Code Repair                     | arxiv-2304.05128                   |
| #328  | STPA MCP Framework                         | arxiv-2601.08012                   |
| #329  | AFlow MCTS Workflows                       | arxiv-2410.10762                   |
| #330  | SEW Self-Evolving Workflows                | arxiv-2505.18646                   |
| #331  | Forest-of-Thought                          | arxiv-2412.09078                   |
| #332  | Agent-SafetyBench                          | arxiv-2412.14470                   |
| #333  | Higher-Order Voting (OW/ISP)               | arxiv-2510.01499                   |
| #334  | DAAO VAE Difficulty                        | arxiv-2509.11079                   |
| #335  | Evolving Orchestration Upgrade             | arxiv-2505.19591                   |
| #336  | Hindsight Belief Memory                    | arxiv-2512.12818                   |
| #337  | Scaling Coordination Predictor             | arxiv-2512.08296                   |
| #338  | ZeroRouter Universal Difficulty            | zerorouter-tbd                     |

---

## Search Tags

`#adaptive` `#agentic-memory` `#agreement` `#anti-conformity` `#attribute-extraction` `#budget-constraint` `#byzantine` `#cascade` `#code-repair` `#comprehensive` `#confidence-aware` `#constitutional` `#contextual-bandit` `#coordinator` `#cost-optimization` `#cross-critique` `#debate` `#dynamic` `#dynamic-linking` `#dynamic-selection`

---

## Registry Files

- [papers.yaml](registry/papers.yaml) - All 67 papers with metadata
- [techniques.yaml](registry/techniques.yaml) - All 38 techniques with status
- [sources.yaml](registry/sources.yaml) - Product docs and other sources

---

## How to Contribute

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on adding new research.

---

_Generated from YAML registries. Last updated: 2026-01-17 (ET)_
