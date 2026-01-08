# Research: Self-Evaluation Protocol Design

> **Purpose**: Document the research foundations informing the swarm self-evaluation protocol.
> **Add to**: `/docs/research/topics/multi-agent-evaluation.md`

---

## Core Techniques Applied

### 1. Multi-Agent Debate (MAD)

**Source**: Du et al., "Improving Factuality and Reasoning in Language Models through Multiagent Debate" (arXiv:2305.14325, 2023)

**Key Insight**: Multiple LLM instances proposing and debating responses over multiple rounds significantly enhances reasoning accuracy and reduces hallucinations.

**Applied In Protocol**:

- Phase 2: Independent evaluation by specialized agents
- Phase 3: Structured debate rounds for divergence resolution
- Anonymization of evaluations before synthesis (prevents conformity bias)

**Limitations Noted**:

- Consensus can be gamed by majority pressure
- "Deeper" errors (architectural/logical) resist self-correction more than surface errors

---

### 2. Heterogeneous Agent Teams

**Source**: "Adaptive Heterogeneous Multi-Agent Debate" (Journal of King Saud University, Nov 2024)

**Key Insight**: Diverse specialized agents outperform homogeneous teams. Dynamic debate scheduling and learned consensus optimization improve over simple majority voting.

**Applied In Protocol**:

- Five distinct evaluator roles (Architect, Pragmatist, Critic, Futurist, Historian)
- Confidence-weighted voting as alternative to simple majority
- Role assignments target different evaluation dimensions

---

### 3. Consensus vs. Voting Mechanisms

**Source**: Kaesberg et al., "Voting or Consensus? Decision-Making in Multi-Agent Debate" (ACL Findings, 2025)

**Key Insight**: Neither pure consensus nor simple voting is universally optimal. Supermajority consensus works better for complex reasoning; voting is more efficient for clear-cut decisions.

**Applied In Protocol**:

- Tiered voting thresholds based on decision severity
- Supermajority (>66%) for architectural/deprecation decisions
- Simple majority for modifications
- Escalation path for deadlocks

---

### 4. Self-Reflection & Critique Models

**Source**:

- Shinn et al., "Reflexion: Language Agents with Verbal Reinforcement Learning" (arXiv:2303.11366)
- Xi et al., "Enhancing LLM Reasoning via Critique Models" (arXiv:2411.16579)

**Key Insight**: Separating reasoning (actor) and critique (evaluator) roles improves performance. Iterative reflection with explicit feedback loops corrects errors more effectively than single-pass evaluation.

**Applied In Protocol**:

- Distinct evaluation phase (Phase 2) before synthesis (Phase 3)
- Structured debate requires explicit reasoning chains
- Retrospective phase captures learnings for future cycles

---

### 5. LLM-Based Code Review

**Source**:

- Zeng et al., "Benchmarking and Studying LLM-based Code Review" (arXiv:2509.01494)
- "AI-powered Code Review with LLMs: Early Results" (arXiv:2404.18496)

**Key Insight**: Multi-review aggregation significantly boosts code review quality (up to 43.67% F1 improvement). Full project context is critical—snippet-level review misses architectural issues.

**Applied In Protocol**:

- Component inventory includes dependency mapping
- Evaluators consider component in context of full architecture
- Multiple independent reviews aggregated before decision

---

### 6. Conformity & Error Propagation

**Source**:

- "Free-MAD: Consensus-Free Multi-Agent Debate" (arXiv:2509.11035)
- Wu et al., "Can LLM Agents Really Debate?" (arXiv:2511.07784)

**Key Insight**: LLMs exhibit strong conformity bias—correct agents can be swayed by incorrect majority. Hiding confidence scores and using anonymization reduces cascading errors.

**Applied In Protocol**:

- Independent evaluation before any cross-agent visibility
- Anonymized aggregation in synthesis phase
- Explicit dissenting view capture (prevents silent override)
- Confidence calibration requirements

---

### 7. Accuracy-Correction Paradox

**Source**: "Decomposing LLM Self-Correction" (arXiv:2601.00828, Dec 2024)

**Key Insight**: Stronger models make fewer but "deeper" errors that resist self-correction. Iterative reflection helps weaker detection compensate (10% → 61% improvement).

**Applied In Protocol**:

- Multiple debate rounds (up to 3) for complex decisions
- Escalation when confidence remains low
- Research integration for novel/uncertain situations

---

### 8. Psychometric Framework for Agent Evaluation

**Source**: "The Social Laboratory: A Psychometric Framework for Multi-Agent LLM Evaluation" (arXiv:2510.01295)

**Key Insight**: Agents exhibit robust consensus-seeking tendency (>0.88 agreement) even without explicit instruction. Moderator persona significantly influences outcomes. Longer debates increase agreement stability.

**Applied In Protocol**:

- Structured debate protocol with explicit rounds
- Phase 6 retrospective tracks consensus patterns
- Metrics on debate rounds needed and agreement distribution

---

## Design Decisions & Rationale

### Why Five Evaluator Roles?

Research shows heterogeneous teams outperform homogeneous ones. The five roles cover:

- **Architect**: Structural/systemic view (catches coupling issues)
- **Pragmatist**: Practical utility (catches over-engineering)
- **Critic**: Adversarial testing (catches failure modes)
- **Futurist**: Goal alignment (catches drift from objectives)
- **Historian**: Context preservation (catches accidental removal of important features)

### Why Supermajority for Deprecation?

Removing code is irreversible (even with git, context is lost). Higher threshold ensures:

- Multiple perspectives agree on removal
- Dissenting views are explicitly captured
- False positives (removing needed code) are minimized

### Why Three Debate Rounds Max?

Research shows diminishing returns after 2-3 rounds. Additional rounds:

- Increase token cost
- Risk conformity pressure overriding minority correctness
- Can lead to "agreement fatigue" rather than genuine consensus

### Why Confidence Calibration?

Uncalibrated confidence leads to:

- Over-confident agents dominating votes
- Under-confident agents being ignored
- Poor decision quality when aggregating

Requiring evidence for high confidence (>0.9) improves signal quality.

---

## Gaps & Future Research

### Open Questions

1. **Optimal Team Size**: Research varies on 3-5 agents. Need to test for this specific use case.

2. **Dynamic Role Assignment**: Could agents switch roles based on component type? (e.g., more Critics for security-sensitive code)

3. **Cross-Cycle Learning**: How to incorporate retrospective learnings into future evaluation prompts?

4. **Partial Consensus**: What to do when 4/5 agents agree but the dissenter has strong evidence?

### Papers to Review

- [ ] MetaGPT: Multi-Agent Collaborative Framework for Software Development
- [ ] AgentVerse: Facilitating Multi-Agent Collaboration
- [ ] CANDOR: Collaborative Agent Network for Distributed Operations and Reasoning
- [ ] SyncMind: Measuring Agent State Synchronization in Multi-Agent Systems

---

## Citation Format

When incorporating these techniques, reference as:

```markdown
Technique applied: [Multi-Agent Debate]
Source: Du et al., arXiv:2305.14325
Adaptation: [how we modified it for our use case]
```

---

## Changelog

| Date       | Update                                             |
| ---------- | -------------------------------------------------- |
| 2025-01-07 | Initial protocol design based on literature review |
