# Multi-Agent Orchestration Research Summary

**Research Date:** 2026-01-06 (ET)
**Papers Analyzed:** 15 arXiv papers (2024-2026)
**Focus:** Cost-efficient routing, consensus protocols, context optimization, adaptive model selection, memory systems
**Related Issue:** #104

---

## Executive Summary

This document catalogs recent research (2024-2026) on multi-agent orchestration, LLM routing, and context management that could improve nexus-agents. Key findings:

- **50% cost reduction** achievable through confidence-aware routing (SATER, IPR)
- **20x latency reduction** through formal consensus protocols (Aegean)
- **3000x prompt compression** possible with behavior-equivalent tokens (BET)
- **Six-type memory architecture** for comprehensive agent memory (MIRIX)

---

## 1. Cost-Efficient LLM Routing

### 1.1 SATER (arXiv:2510.05164) - EMNLP 2025

**Key Technique:** Dual-mode routing with shortest-response preference optimization and confidence-aware rejection.

**Performance:**

- 50%+ cost reduction
- 80%+ cascade latency reduction
- Comparable accuracy to full-model inference

**How it works:** Fine-tunes small models to (1) generate shorter responses when appropriate and (2) confidently reject queries outside capability range. Works with both pre-generation and cascade strategies.

**nexus-agents Application:**

- Integrate into `adapters/` for adaptive model selection
- Add confidence-aware rejection to `agents/experts/expert-selector.ts`
- Train small classifier to pre-screen tasks

**Priority: P2** (Medium impact, moderate complexity)

---

### 1.2 IPR: Intelligent Prompt Routing (arXiv:2509.06274)

**Key Technique:** Quality-constrained routing with user-controlled tolerance parameter and lightweight estimators.

**Performance:**

- 43.9% cost reduction
- Quality parity with strongest model
- Sub-150ms latency
- Trained on 1.5M prompts (IPRBench dataset)

**Architecture:**

1. Modular quality estimators with calibrated scores
2. User-controlled tolerance parameter (0-1)
3. Frozen encoders with model-specific adapters

**nexus-agents Application:**

- Directly applicable to CLI adapter capability matching
- Implement quality estimator in TechLead task routing
- Add tolerance parameter to `WorkflowDefinition`

**Priority: P1** (High impact, aligns with existing architecture)

---

### 1.3 PILOT (arXiv:2508.21141) - EMNLP 2025 Findings

**Key Technique:** Contextual bandit (LinUCB) with preference-prior routing and multi-choice knapsack budget constraints.

**Performance:**

- Adaptive decision-making without exhaustive inference
- Handles diverse budget requirements dynamically

**How it works:** Creates shared embedding space where query and LLM embeddings reflect affinity. Uses offline preference data for initial training, refined through online bandit feedback.

**nexus-agents Application:**

- Implement budget-aware routing in `workflows/execution-planner.ts`
- Add cost tracking to `ContextBudget`
- Enable per-workflow budget constraints

**Priority: P1** (High impact, fills gap in current implementation)

---

## 2. Multi-Agent Consensus

### 2.1 Aegean (arXiv:2512.20184)

**Key Technique:** Formal consensus protocol for stochastic reasoning with incremental quorum detection.

**Performance:**

- 1.2x-20x latency reduction
- 4.4x token consumption reduction
- Answer quality within 2.5% of baselines

**Components:**

1. Formal model of multi-agent refinement
2. Aegean-Serve: consensus-aware serving engine
3. Agreement Monitor: incremental quorum during streaming

**nexus-agents Application:**

- Replace heuristic consensus in `agents/collaboration/consensus-protocol.ts`
- Implement early termination when quorum reached
- Add streaming quorum detection to collaboration sessions

**Priority: P1** (High impact, direct replacement for existing module)

---

### 2.2 CP-WBFT (arXiv:2511.10400)

**Key Technique:** Confidence Probe-based Weighted Byzantine Fault Tolerant consensus.

**Performance:**

- 85.7% fault rate tolerance
- Superior accuracy across network topologies
- Strong reliability in reasoning and safety tasks

**How it works:** Probe-based, weighted information flow. LLM agents show stronger skepticism when processing erroneous messages.

**nexus-agents Application:**

- Add Byzantine fault tolerance to expert collaboration
- Implement confidence probes for vote weighting
- Enhance `agents/collaboration/result-aggregator.ts`

**Priority: P2** (Medium impact, specialized use case)

---

### 2.3 Free-MAD (arXiv:2509.11035)

**Key Technique:** Score-based decision with anti-conformity to prevent majority influence on correct answers.

**Performance:**

- Significant reasoning improvements across 8 benchmarks
- Reduced computational costs (single round)
- Enhanced robustness against attacks

**How it works:** Evaluates entire debate trajectory rather than just final round. Anti-conformity prevents correct responses from being swayed by incorrect majority.

**nexus-agents Application:**

- Add trajectory-based scoring to consensus protocol
- Implement anti-conformity weights in voting
- Useful for review protocols

**Priority: P2** (Medium impact, novel approach)

---

## 3. Context Optimization

### 3.1 xKV (arXiv:2503.18893)

**Key Technique:** Cross-layer SVD for KV-cache compression exploiting singular vector alignment.

**Performance:**

- 6.8x compression vs state-of-the-art
- 2.7% accuracy improvement
- Plug-and-play, no fine-tuning needed

**nexus-agents Application:**

- Not directly applicable (requires model-level integration)
- Inform future self-hosted model strategies
- Relevant for Ollama adapter optimizations

**Priority: P4** (Infrastructure-level)

---

### 3.2 TreeKV (arXiv:2501.04987)

**Key Technique:** Tree-structured cache compression with smooth context transitions.

**Performance:**

- 16x cache reduction
- Best performance with 6% budget on Longbench

**How it works:** Wavelet analysis insight - token contributions increase and diverge near sequence end.

**nexus-agents Application:**

- Inform context pruning in `agents/context-manager.ts`
- Add hierarchical priority based on task distance
- Implement smooth transition between priority levels

**Priority: P3** (Conceptual influence)

---

### 3.3 BET: Behavior-Equivalent Token (arXiv:2511.23271)

**Key Technique:** Single-token compression of system prompts via reconstruction and behavior distillation.

**Performance:**

- Up to 3000x prompt reduction
- Preserves downstream behavior
- No model internals access required

**nexus-agents Application:**

- Reduce expert system prompt overhead
- Applicable to `agents/experts/expert-prompts.ts`
- Requires training phase per expert type

**Priority: P3** (Medium impact, requires training)

---

## 4. Adaptive Model Selection

### 4.1 TRINITY (arXiv:2512.04695)

**Key Technique:** Evolved LLM coordinator with Thinker/Worker/Verifier roles using CMA-ES optimization.

**Performance:**

- 86.2% on LiveCodeBench
- Outperforms individual models
- Generalizes to out-of-distribution scenarios

**Architecture:**

- Coordinator: 0.6B model + 10K parameter head
- Roles: Thinker (reasoning), Worker (execution), Verifier (validation)

**nexus-agents Application:**

- Maps directly to TechLead/Expert pattern
- Add explicit Verifier role to `agents/experts/expert-types.ts`
- Implement evolutionary optimization for role assignment
- Enhance `agents/tech-lead-decomposition.ts`

**Priority: P1** (High impact, architectural alignment)

---

### 4.2 STRMAC (arXiv:2511.02200)

**Key Technique:** State-aware routing with separate encoding of history and agent knowledge.

**Performance:**

- Up to 23.8% improvement over baselines
- 90.1% training data reduction via self-evolving generation

**nexus-agents Application:**

- Implement state tracking in collaboration sessions
- Add interaction history encoding to expert selection
- Enhance `agents/experts/task-analyzer.ts` with state awareness

**Priority: P2** (Medium-high impact)

---

### 4.3 LATTS (arXiv:2509.20368)

**Key Technique:** Locally adaptive test-time scaling with verifier-based acceptance criterion.

**Performance:**

- Llama-3.2-1B matches Llama-405B performance
- Decisions: resample, backtrack, restart, or stop

**nexus-agents Application:**

- Implement adaptive compute in workflow steps
- Add backtrack/restart to `workflows/step-executor.ts`
- Useful for complex multi-step tasks with verification

**Priority: P2** (Advanced feature)

---

## 5. Memory Systems

### 5.1 MIRIX (arXiv:2507.07957)

**Key Technique:** Six-type memory system with multi-agent management architecture.

**Performance:**

- 35% higher accuracy than RAG on multimodal tasks
- 99.9% storage reduction
- 85.4% accuracy on LOCOMO benchmark

**Six Memory Types:**

1. **Core** - fundamental user/agent information
2. **Episodic** - event-based memories
3. **Semantic** - factual knowledge
4. **Procedural** - how-to knowledge
5. **Resource** - references and links
6. **Knowledge Vault** - structured data storage

**nexus-agents Application:**

- Comprehensive memory for long-running agents
- Implement in new `agents/memory/` module
- Active Retrieval aligns with context manager categories

**Priority: P2** (High potential, significant implementation)

---

### 5.2 MobiMem (arXiv:2512.15784)

**Key Technique:** Post-deployment evolution via Profile, Experience, and Action memory modules.

**Performance:**

- 83.1% profile alignment
- 280x faster retrieval than GraphRAG
- 50.3% task success improvement

**Three Modules:**

1. **Profile Memory** - DisGraph for user preferences (23.83ms retrieval)
2. **Experience Memory** - Multi-level templates for task generalization
3. **Action Memory** - ActTree/ActChain for action caching

**nexus-agents Application:**

- Enable agent improvement without retraining
- Experience Memory applicable to workflow templates
- Action Memory caches successful expert interactions

**Priority: P2** (High impact for production)

---

### 5.3 LatentMAS (arXiv:2511.20639)

**Key Technique:** Direct latent space collaboration through hidden state sharing.

**Performance:**

- Up to 14.6% accuracy improvement
- 70.8%-83.7% output token reduction
- 4x-4.3x faster inference

**nexus-agents Application:**

- Revolutionary inter-agent communication approach
- Requires same-model deployment for embedding compatibility
- Applicable to Ollama adapter with local models

**Priority: P3** (High potential, significant architecture change)

---

## Implementation Priority Matrix

| Priority | Paper     | Impact | Complexity | Integration Point                   |
| -------- | --------- | ------ | ---------- | ----------------------------------- |
| **P1**   | IPR       | High   | Medium     | adapters/, routing                  |
| **P1**   | PILOT     | High   | Medium     | workflows/execution-planner.ts      |
| **P1**   | Aegean    | High   | Medium     | collaboration/consensus-protocol.ts |
| **P1**   | TRINITY   | High   | Medium     | agents/tech-lead\*.ts               |
| **P2**   | SATER     | Medium | High       | adapters/, expert-selector.ts       |
| **P2**   | CP-WBFT   | Medium | Medium     | collaboration/result-aggregator.ts  |
| **P2**   | Free-MAD  | Medium | Low        | consensus-protocol.ts               |
| **P2**   | STRMAC    | Medium | Medium     | experts/task-analyzer.ts            |
| **P2**   | LATTS     | Medium | High       | workflows/step-executor.ts          |
| **P2**   | MIRIX     | High   | High       | agents/memory/ (new)                |
| **P2**   | MobiMem   | High   | High       | agents/, workflows/                 |
| **P3**   | TreeKV    | Low    | Low        | agents/context-manager.ts           |
| **P3**   | BET       | Medium | High       | experts/expert-prompts.ts           |
| **P3**   | LatentMAS | High   | Very High  | collaboration/ (architecture)       |
| **P4**   | xKV       | Low    | N/A        | Infrastructure-level                |

---

## Recommended Implementation Roadmap

### Phase 1 (v2.3.0): Core Routing & Consensus

1. **IPR-style quality estimators** - Add to adapter factory
2. **Aegean consensus protocol** - Replace current heuristic
3. **PILOT budget constraints** - Add cost tracking and enforcement

### Phase 2 (v2.4.0): Role-Based Orchestration

1. **TRINITY role system** - Formalize Thinker/Worker/Verifier
2. **STRMAC state tracking** - Add interaction history
3. **Free-MAD anti-conformity** - Enhance consensus scoring

### Phase 3 (v3.0.0): Memory & Evolution

1. **MIRIX memory types** - Implement structured memory
2. **MobiMem experience caching** - Enable post-deployment learning
3. **LATTS adaptive execution** - Add backtrack/restart

### Phase 4 (v3.x): Advanced Optimization

1. **BET prompt compression** - Train behavior-equivalent tokens
2. **LatentMAS collaboration** - Latent space sharing
3. **CP-WBFT fault tolerance** - Byzantine fault tolerance

---

## Related GitHub Issues

| Issue | Feature                                  | Related Papers   |
| ----- | ---------------------------------------- | ---------------- |
| #99   | Confidence-aware cascade routing (SATER) | SATER, IPR       |
| #100  | Multi-round voting protocol              | Aegean, Free-MAD |
| #101  | Typed memory architecture (MIRIX)        | MIRIX, MobiMem   |
| #102  | Budget-constrained routing               | PILOT, IPR       |
| #103  | Weighted Byzantine voting (CP-WBFT)      | CP-WBFT          |

---

## References

### Cost-Efficient Routing

- [SATER](https://arxiv.org/abs/2510.05164) - EMNLP 2025
- [IPR](https://arxiv.org/abs/2509.06274) - Amazon Bedrock
- [PILOT](https://arxiv.org/abs/2508.21141) - EMNLP 2025 Findings

### Multi-Agent Consensus

- [Aegean](https://arxiv.org/abs/2512.20184) - NUS
- [CP-WBFT](https://arxiv.org/abs/2511.10400) - Byzantine Fault Tolerance
- [Free-MAD](https://arxiv.org/abs/2509.11035) - Score-based Debate

### Context Optimization

- [xKV](https://arxiv.org/abs/2503.18893) - [GitHub](https://github.com/abdelfattah-lab/xKV)
- [TreeKV](https://arxiv.org/abs/2501.04987) - Tree-structured Compression
- [BET](https://arxiv.org/abs/2511.23271) - Behavior-Equivalent Token

### Adaptive Selection

- [TRINITY](https://arxiv.org/abs/2512.04695) - Evolved Coordinator
- [STRMAC](https://arxiv.org/abs/2511.02200) - State-Aware Routing
- [LATTS](https://arxiv.org/abs/2509.20368) - Locally Adaptive Scaling

### Memory Systems

- [MIRIX](https://arxiv.org/abs/2507.07957) - Six Memory Types
- [MobiMem](https://arxiv.org/abs/2512.15784) - Post-Deployment Evolution
- [LatentMAS](https://arxiv.org/abs/2511.20639) - Latent Space Sharing

---

_Last updated: 2026-01-06 (ET)_
