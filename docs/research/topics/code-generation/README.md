# Code Generation & Self-Improvement

**Last Updated:** 2026-01-07 (ET)
**Status:** Active Research

---

## Overview

Research on self-improvement mechanisms for code-generating AI agents, including iterative refinement, verbal reinforcement learning, skill libraries, and constitutional AI approaches.

## Key Papers

| Paper                                                 | Key Contribution                                    | Priority | Status      |
| ----------------------------------------------------- | --------------------------------------------------- | -------- | ----------- |
| [Self-Refine](https://arxiv.org/abs/2303.17651)       | Training-free iterative refinement, 20% improvement | P1       | planned     |
| [Reflexion](https://arxiv.org/abs/2303.11366)         | Verbal RL with episodic memory, 91% HumanEval       | P1       | implemented |
| [Voyager](https://arxiv.org/abs/2305.16291)           | Skill library pattern, 15.3x faster milestones      | P2       | planned     |
| [SICA](https://arxiv.org/abs/2504.15228)              | Self-improving agent, 17%→53% SWE-Bench             | P2       | planned     |
| [Constitutional AI](https://arxiv.org/abs/2212.08073) | Principle-based self-critique                       | P2       | planned     |
| [Agent Q](https://arxiv.org/abs/2408.07199)           | MCTS + self-critique, 340% improvement              | -        | not-started |
| [LATS](https://arxiv.org/abs/2310.04406)              | Tree search with reflection, 92.7% HumanEval        | -        | not-started |
| [Godel Agent](https://arxiv.org/abs/2410.04444)       | Recursive self-modification                         | -        | not-started |

## Recommended Techniques

### High Priority (P1)

#### Self-Refine Iterative Loop

- **Source:** [arxiv-2303.17651](https://arxiv.org/abs/2303.17651)
- **Key Metrics:** Average 20% improvement across tasks
- **Integration Point:** `packages/nexus-agents/src/agents/`

Single LLM acts as generator, feedback provider, and refiner in an iterative loop without any training. Can be implemented immediately with strong instruction-following models.

#### Reflexion Verbal RL ✅

- **Source:** [arxiv-2303.11366](https://arxiv.org/abs/2303.11366)
- **Key Metrics:** +22% AlfWorld, +20% HotPotQA, 91% HumanEval pass@1
- **Integration Point:** `packages/nexus-agents/src/context/session-memory.ts`
- **Status:** Implemented (#130)

Agents maintain episodic memory of verbal reflections that guide future behavior. Implemented as `SessionMemory` class with cross-session persistence, learning recording, and relevance-based retrieval.

### Medium Priority (P2)

#### Voyager Skill Library Pattern

- **Source:** [arxiv-2305.16291](https://arxiv.org/abs/2305.16291)
- **Key Metrics:** 3.3x more discoveries, 15.3x faster milestone achievement
- **Integration Point:** `packages/nexus-agents/src/agents/`

Ever-growing library of executable code skills with automatic curriculum. Skills are temporally extended, interpretable, and compositional.

#### SICA Self-Improving Agent

- **Source:** [arxiv-2504.15228](https://arxiv.org/abs/2504.15228)
- **Key Metrics:** SWE-Bench 17%→53%, file editing 82%→94%
- **Integration Point:** `packages/nexus-agents/src/agents/`

Unified agent that performs tasks AND improves its own implementation through tool orchestration. Requires agent versioning with performance tracking.

#### Constitutional AI Self-Critique

- **Source:** [arxiv-2212.08073](https://arxiv.org/abs/2212.08073)
- **Integration Point:** `packages/nexus-agents/src/agents/`

Define constitution of principles for agent behavior. Self-critique against explicit criteria scales without human labelers.

## Safety Considerations

### Reward Hacking Risks

- Exploiting loopholes in evaluation
- Gaming metrics instead of achieving goals
- Self-modifying evaluation suite

### Mitigations

- Agent versioning with rollback
- Performance bounds with automatic rollback
- Human approval for significant changes
- Sandboxed testing before deployment
- Rate limiting self-modification attempts

## Implementation Roadmap

1. **Phase 1 (v2.3.0):** Self-Refine loop, Reflexion memory
2. **Phase 2 (v2.4.0):** Voyager skill library, SICA versioning
3. **Phase 3 (v3.0.0):** Constitutional AI, RLAIF feedback

## Related Topics

- [Memory](../memory/README.md) - Reflection storage
- [Consensus](../consensus/README.md) - Multi-agent critique

## References

- [Self-Refine: Iterative Refinement](https://arxiv.org/abs/2303.17651)
- [Reflexion: Verbal Reinforcement Learning](https://arxiv.org/abs/2303.11366)
- [Voyager: Open-Ended Embodied Agent](https://arxiv.org/abs/2305.16291)
- [SICA: Self-Improving Coding Agent](https://arxiv.org/abs/2504.15228)
- [Constitutional AI](https://arxiv.org/abs/2212.08073)
- [Anthropic: Emergent Misalignment](https://www.anthropic.com/research/emergent-misalignment-reward-hacking)
