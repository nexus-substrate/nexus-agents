# Multi-Agent Improvements Research Summary

**Created:** 2026-01-06 (ET)
**Status:** Active Research
**Related Issue:** #104

---

## Executive Summary

This document catalogs recent papers (2024-2026) on multi-agent orchestration, LLM routing, and context management applicable to nexus-agents. The research identifies practical techniques with demonstrated cost and quality improvements.

---

## 1. Cost-Efficient LLM Routing

### 1.1 SATER: Self-Aware Token-Efficient Routing

**Paper:** arXiv:2510.05164 (Oct 2025)

**Key Technique:** Dual-mode routing combining confidence-aware direct routing with progressive cascade escalation.

**Results:**

- 50% computational cost reduction
- 80% cascade latency reduction

**Application:** Add confidence threshold to ExpertSelector before cascade. Skip expensive models when fast models are confident.

**Implementation:** [#99](https://github.com/williamzujkowski/nexus-agents/issues/99)

---

### 1.2 IPR: Intelligent Prompt Routing

**Paper:** arXiv:2509.06274 (Sep 2025)

**Key Technique:** Production-deployed system using lightweight quality estimators trained on 1.5M prompts with user-controlled quality-cost slider.

**Results:**

- 43.9% cost reduction
- Quality parity maintained

**Application:** Train quality estimator on task-performance history. Add user-facing `routingMode` configuration.

---

### 1.3 Training-Free Online Routing

**Paper:** arXiv:2509.02718 (Sep 2025)

**Key Technique:** First training-free online routing algorithm using bandit-style exploration without pre-computed model scores.

**Results:**

- 1.85x cost efficiency improvement
- 4.25x throughput gains

**Application:** Implement online learning for router without training data. Use Thompson Sampling for model selection.

---

### 1.4 PILOT: Adaptive Budget-Constrained Routing

**Paper:** arXiv:2508.21141 (Aug 2025)

**Key Technique:** Contextual bandit approach supporting diverse user budget constraints without exhaustive inference.

**Application:** Add budget parameter to task routing with token/cost/latency limits.

**Implementation:** [#102](https://github.com/williamzujkowski/nexus-agents/issues/102)

---

## 2. Multi-Agent Consensus Mechanisms

### 2.1 Aegean: Provable Consensus for Stochastic Reasoning Agents

**Paper:** arXiv:2512.20184 (Dec 2025)

**Key Technique:** Byzantine-fault-tolerant consensus protocol adapted for stochastic LLM outputs with provable safety and liveness guarantees.

**Results:**

- 1.2-20x latency reduction vs naive consensus
- Handles agent disagreement formally

**Application:** Replace ad-hoc voting with formal consensus protocol for high-stakes decisions.

---

### 2.2 CP-WBFT: Weighted Byzantine Fault Tolerance

**Paper:** arXiv:2511.10400 (Nov 2025)

**Key Technique:** Weighted Byzantine consensus where agent votes are weighted by historical reliability.

**Results:**

- 85.7% fault rate tolerance under extreme conditions

**Application:** Weight expert votes by performance history. Automatic trust calibration.

**Implementation:** [#103](https://github.com/williamzujkowski/nexus-agents/issues/103)

---

### 2.3 Free-MAD: Consensus-Free Multi-Agent Debate

**Paper:** arXiv:2509.11035 (Sep 2025)

**Key Technique:** Score-based mechanism eliminating consensus requirement. Introduces anti-conformity to mitigate error propagation from groupthink.

**Application:** Alternative to consensus when speed matters. Score aggregation instead of voting rounds.

---

### 2.4 Multi-Agent LLM Committees for Beta Testing

**Paper:** arXiv:2512.21352 (Dec 2025)

**Key Technique:** Three-round voting protocol with 2-4 agents.

**Results:**

- 91.7-100% success rate vs 78% single-agent baseline

**Application:** Implement 3-round voting for code review tasks.

**Implementation:** [#100](https://github.com/williamzujkowski/nexus-agents/issues/100)

---

### 2.5 Sycophancy in Multi-Agent Debate

**Paper:** arXiv:2509.23055 (Sep 2025)

**Key Technique:** Framework analyzing inter-agent sycophancy and proposing design principles for balanced disagreement.

**Application:** Detect and prevent premature consensus. Encourage constructive disagreement.

---

## 3. Context Window Optimization

### 3.1 xKV: Cross-Layer SVD Compression

**Paper:** arXiv:2503.18893 (Mar 2025)

**Key Technique:** Applies SVD across layers for KV cache compression.

**Results:**

- 6.8x higher compression rates than state-of-the-art

**Complexity:** High (requires model-level integration)

---

### 3.2 QwenLong-CPRS: Dynamic Context Compression

**Paper:** arXiv:2505.18092 (May 2025)

**Key Technique:** Dynamic context optimization with learned compression.

**Results:**

- 21.59x context compression across architectures

---

### 3.3 TreeKV: Tree-Structured Cache Compression

**Paper:** arXiv:2501.04987 (Jan 2025)

**Key Technique:** Tree structures for smooth hierarchical compression.

**Results:**

- 16x cache reduction on language modeling

**Application:** Hierarchical importance-based context pruning.

---

### 3.4 BET: Behavior-Equivalent Tokens

**Paper:** arXiv:2511.23271 (Nov 2025)

**Key Technique:** Replace lengthy system prompts with single learned tokens.

**Results:**

- 3000x reduction in prompt length
- 98% downstream performance retention

**Complexity:** High (requires fine-tuning)

---

## 4. Adaptive Model Selection

### 4.1 TRINITY: Evolved LLM Coordinator

**Paper:** arXiv:2512.04695 (Dec 2025)

**Key Technique:** Lightweight coordinator optimizing role assignment (Thinker, Worker, Verifier) to specialized LLMs.

**Results:**

- 86.2% on LiveCodeBench with adaptive delegation

**Application:** Add Thinker/Worker/Verifier roles to expert types.

---

### 4.2 Optimal-Agent-Selection: State-Aware Routing

**Paper:** arXiv:2511.02200 (Nov 2025)

**Key Technique:** Adaptively selects suitable agents per step based on interaction history.

**Results:**

- 23.8% improvement
- 90.1% reduced data collection overhead

**Application:** Route based on conversation state, not just initial task.

---

### 4.3 Dynamic Template Selection

**Paper:** arXiv:2509.20683 (Sep 2025)

**Key Technique:** Routing system matching response templates to query difficulty.

**Results:**

- 90.5% routing accuracy
- 32.6-33.9% token cost reduction

**Application:** Pre-define response templates per task type. Route simple tasks to templates.

---

## 5. Memory Systems for Multi-Agent Coordination

### 5.1 MIRIX: Six-Type Memory System

**Paper:** arXiv:2507.07957 (Jul 2025)

**Key Technique:** Six memory types:

1. Core (identity/constraints)
2. Episodic (experiences)
3. Semantic (facts)
4. Procedural (skills)
5. Resource (external references)
6. Knowledge Vault (persistent store)

**Application:** Implement typed memory architecture.

**Implementation:** [#101](https://github.com/williamzujkowski/nexus-agents/issues/101)

---

### 5.2 RCR-Router: Role-Aware Context Routing

**Paper:** arXiv:2508.04903 (Aug 2025)

**Key Technique:** Dynamically selects semantically relevant memory subsets for each agent based on role while managing token budgets.

**Application:** Filter memory by agent role relevance.

---

### 5.3 MOBIMEM: Post-Deployment Evolution

**Paper:** arXiv:2512.15784 (Dec 2025)

**Key Technique:** Three specialized memory primitives:

1. Profile Memory (agent identity)
2. Experience Memory (task history)
3. Action Memory (skill patterns)

**Application:** Structure memory for self-improvement. Enable agents to evolve capabilities.

---

### 5.4 LatentMAS: Latent Space Collaboration

**Paper:** arXiv:2511.20639 (Nov 2025)

**Key Technique:** Agents collaborate directly in latent space with shared latent working memory.

**Application:** Share embeddings instead of text between agents.

**Complexity:** High (requires embedding model integration)

---

## Implementation Priority Matrix

| Enhancement                         | Complexity  | Impact | Priority | Issue |
| ----------------------------------- | ----------- | ------ | -------- | ----- |
| Confidence-aware routing (SATER)    | Low-Medium  | High   | **P1**   | #99   |
| 3-round voting protocol             | Low         | High   | **P1**   | #100  |
| Typed memory architecture (MIRIX)   | Medium-High | High   | **P2**   | #101  |
| Budget-constrained routing (PILOT)  | Medium      | High   | **P2**   | #102  |
| Weighted Byzantine voting (CP-WBFT) | Medium      | High   | **P2**   | #103  |
| State-aware routing                 | Medium      | Medium | P3       | -     |
| TreeKV compression                  | Medium      | Medium | P3       | -     |
| TRINITY role assignment             | Medium      | High   | P3       | -     |
| LatentMAS embedding sharing         | High        | Medium | P4       | -     |
| BET prompt compression              | High        | High   | P4       | -     |

---

## Key Themes

1. **Routing has matured** - Multiple production-deployed systems achieve 30-50% cost reduction with quality parity.

2. **Consensus is formalized** - Byzantine fault tolerance and provable guarantees are available for LLM agent coordination.

3. **Context compression scales** - 10-20x compression ratios are achievable with minimal quality loss.

4. **Adaptive selection is state-aware** - Best systems re-evaluate routing at each step based on conversation history.

5. **Memory architectures are typed** - Six-type memory systems with role-aware filtering outperform monolithic approaches.

---

## References

- [arxiv.org](https://arxiv.org) - Primary source for papers
- [docs/research/multi-agent-coordination.md](./multi-agent-coordination.md) - Earlier research (RouteLLM, MoMA, TOPSIS)
- [docs/research/self-improvement-feedback-loops.md](./self-improvement-feedback-loops.md) - Self-improvement patterns

---

_Last updated: 2026-01-06 (ET)_
