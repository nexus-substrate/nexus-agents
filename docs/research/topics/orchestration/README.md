# Multi-Agent Orchestration

**Last Updated:** 2026-01-07 (ET)
**Status:** Active Research

---

## Overview

Research on coordinating multiple AI agents for complex task completion, including role-based orchestration, dynamic agent selection, hybrid architectures, and adaptive compute strategies.

## Key Papers

| Paper                                                      | Key Contribution                                   | Priority | Status      |
| ---------------------------------------------------------- | -------------------------------------------------- | -------- | ----------- |
| [TRINITY](https://arxiv.org/abs/2512.04695)                | Thinker/Worker/Verifier roles, 86.2% LiveCodeBench | P1       | planned     |
| [Multi-Agent Survey](https://arxiv.org/abs/2501.06322)     | Coordination taxonomy (rule/role/model-based)      | -        | not-started |
| [Evolving Orchestration](https://arxiv.org/abs/2505.19591) | RL-trained orchestrator, 15-30% improvement        | P4       | not-started |
| [LATTS](https://arxiv.org/abs/2509.20368)                  | Adaptive test-time compute                         | P2       | not-started |
| [Pick and Spin](https://arxiv.org/abs/2512.22402)          | Helm deployment, 21.6% higher success              | -        | not-started |
| [Multi-LLM Engine](https://arxiv.org/abs/2410.10039)       | Temporal graph + vector DB                         | -        | not-started |
| [AgentsNet](https://arxiv.org/abs/2507.08616)              | 100-agent coordination benchmark                   | -        | not-started |

## Recommended Techniques

### High Priority (P1)

#### TRINITY Role System

- **Source:** [arxiv-2512.04695](https://arxiv.org/abs/2512.04695)
- **Key Metrics:** 86.2% on LiveCodeBench, generalizes OOD
- **Integration Point:** `packages/nexus-agents/src/agents/tech-lead.ts`, `packages/nexus-agents/src/agents/experts/expert-types.ts`

Evolved LLM coordinator with Thinker (reasoning), Worker (execution), Verifier (validation) roles. Maps directly to TechLead/Expert pattern. Uses CMA-ES optimization for role assignment.

### Medium Priority (P2)

#### LATTS Adaptive Compute

- **Source:** [arxiv-2509.20368](https://arxiv.org/abs/2509.20368)
- **Key Metrics:** 1B model matches 405B performance
- **Integration Point:** `packages/nexus-agents/src/workflows/step-executor.ts`

Locally adaptive test-time scaling with verifier-based acceptance. Decisions: resample, backtrack, restart, or stop. Useful for complex multi-step tasks.

### Future Exploration (P4)

#### RL-Trained Orchestrator

- **Source:** [arxiv-2505.19591](https://arxiv.org/abs/2505.19591)
- **Key Metrics:** 15-30% task completion improvement

Dynamic agent selection via RL-trained policy. Emergent behaviors: hub agents (compaction) and recursive critique (cyclicality). Requires RL infrastructure.

## Coordination Strategies

Based on Multi-Agent Collaboration Survey:

1. **Rule-Based Protocols**
   - Predefined rules for efficiency/predictability
   - Low overhead, high determinism
   - nexus-agents: WorkflowDefinition step sequences

2. **Role-Based Protocols**
   - Distinct responsibilities per agent (MetaGPT-style SOPs)
   - Clear separation of concerns
   - nexus-agents: Expert types (Code, Security, Architecture)

3. **Model-Based Protocols**
   - Probabilistic decision-making with Theory of Mind
   - Adaptive, but higher complexity
   - nexus-agents: Future TRINITY integration

**Recommendation:** Hybrid rule+model coordination. Use rules for deterministic steps, models for adaptive decisions.

## Architectural Patterns

### Puppeteer Pattern (Evolving Orchestration)

```
Lead Agent -> Dynamic Policy -> Selected Expert -> Result -> Lead Agent
```

### Hub Pattern (AgentsNet)

```
Hub Agent <-> Expert 1
           <-> Expert 2
           <-> Expert 3
```

### Cascade Pattern (Pick and Spin)

```
Task -> Cheap Model -> [Confident?] -> Yes -> Result
                   |
                   No -> Stronger Model -> Result
```

## Implementation Roadmap

1. **Phase 2 (v2.4.0):** TRINITY role system (Thinker/Worker/Verifier)
2. **Phase 3 (v3.0.0):** LATTS adaptive compute, STRMAC state tracking
3. **Phase 4 (v3.x):** RL-trained orchestrator (requires infrastructure)

## Related Topics

- [Consensus](../consensus/README.md) - Decision-making protocols
- [Routing](../routing/README.md) - Task-to-model routing
- [CLI Tools](../cli-tools/README.md) - CLI integration

## References

- [TRINITY: Evolved Coordinator](https://arxiv.org/abs/2512.04695)
- [Multi-Agent Collaboration Survey](https://arxiv.org/abs/2501.06322)
- [Evolving Orchestration](https://arxiv.org/abs/2505.19591)
- [LATTS: Locally Adaptive Scaling](https://arxiv.org/abs/2509.20368)
- [Pick and Spin: Multi-Model Orchestration](https://arxiv.org/abs/2512.22402)
