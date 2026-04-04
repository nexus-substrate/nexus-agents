# Memory Systems

**Last Updated:** 2026-01-07 (ET)
**Status:** Active Research

---

## Overview

Research on memory architectures for AI agents including long-term memory, context compression, graph-based memory, and multi-type memory systems for comprehensive agent capabilities.

## Key Papers

| Paper                                       | Key Contribution                                 | Priority | Status      |
| ------------------------------------------- | ------------------------------------------------ | -------- | ----------- |
| [Mem0](https://arxiv.org/abs/2504.19413)    | Scalable long-term memory, 91% latency reduction | P2       | implemented |
| [MIRIX](https://arxiv.org/abs/2507.07957)   | Six-type memory system, 35% accuracy improvement | P2       | implemented |
| [MobiMem](https://arxiv.org/abs/2512.15784) | Post-deployment evolution, 280x faster retrieval | P2       | implemented |
| [BET](https://arxiv.org/abs/2511.23271)     | 3000x prompt compression                         | P3       | implemented |
| [TreeKV](https://arxiv.org/abs/2501.04987)  | 16x cache reduction                              | P3       | implemented |
| [xKV](https://arxiv.org/abs/2503.18893)     | 6.8x KV-cache compression                        | P4       | implemented |
| [Acon](https://arxiv.org/abs/2510.00615)    | Task-specific compression                        | -        | implemented |
| [CCF](https://arxiv.org/abs/2509.09199)     | Learned compression modules                      | -        | implemented |

## Recommended Techniques

### Medium Priority (P2)

#### Mem0 Scalable Long-Term Memory

- **Source:** [arxiv-2504.19413](https://arxiv.org/abs/2504.19413)
- **Key Metrics:** 91% latency reduction, 90% token savings, 26% quality improvement
- **Integration Point:** `packages/nexus-agents/src/agents/memory/`
- **GitHub Issue:** #101

Scalable memory architecture with dynamic extraction of salient information and consolidation across sessions. Graph-based variant provides additional 2% improvement.

#### MIRIX Six-Type Memory System

- **Source:** [arxiv-2507.07957](https://arxiv.org/abs/2507.07957)
- **Key Metrics:** 35% accuracy vs RAG, 99.9% storage reduction
- **Integration Point:** `packages/nexus-agents/src/agents/memory/`
- **GitHub Issue:** #101

Comprehensive six-type memory: Core, Episodic, Semantic, Procedural, Resource, Knowledge Vault. Active Retrieval aligns with context manager categories.

#### MobiMem Post-Deployment Evolution

- **Source:** [arxiv-2512.15784](https://arxiv.org/abs/2512.15784)
- **Key Metrics:** 83.1% profile alignment, 280x faster retrieval, 50.3% task success
- **Integration Point:** `packages/nexus-agents/src/agents/`, `packages/nexus-agents/src/workflows/`

Three-module architecture: Profile Memory (user preferences), Experience Memory (task patterns), Action Memory (caching). Enables post-deployment agent improvement.

### Lower Priority (P3-P4)

#### BET Behavior-Equivalent Token

- **Source:** [arxiv-2511.23271](https://arxiv.org/abs/2511.23271)
- **Key Metrics:** Up to 3000x prompt reduction
- **Integration Point:** `packages/nexus-agents/src/agents/experts/`

Single-token compression of system prompts via behavior distillation. Requires training phase per expert type.

## Implementation Roadmap

1. **Phase 2 (v2.4.0):** Mem0 basic architecture
2. **Phase 3 (v3.0.0):** MIRIX six-type memory, MobiMem evolution
3. **Phase 4 (v3.x):** BET prompt compression, graph-based extensions

## Related Topics

- [Code Generation](../code-generation/README.md) - Reflexion memory
- [Orchestration](../orchestration/README.md) - Context management

## References

- [Mem0: Scalable Long-Term Memory](https://arxiv.org/abs/2504.19413)
- [MIRIX: Six-Type Memory System](https://arxiv.org/abs/2507.07957)
- [MobiMem: Post-Deployment Evolution](https://arxiv.org/abs/2512.15784)
- [BET: Behavior-Equivalent Token](https://arxiv.org/abs/2511.23271)
- [Context Engineering Survey](https://arxiv.org/abs/2507.13334)
