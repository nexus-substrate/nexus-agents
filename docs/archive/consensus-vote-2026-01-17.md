# Research Consensus Vote - 2026-01-17

**Protocol:** Weighted Byzantine Voting (CP-WBFT)
**Voting Agents:** 15 specialized research reviewers
**Threshold:** Supermajority (≥67% weighted approval)
**Date:** 2026-01-17 (ET)

---

## Consensus Matrix

### P1 Priority - High Impact, Direct Fit

| Paper                             | arXiv ID   | Agents FOR | Agents AGAINST | ABSTAIN | Weighted Score | Decision     |
| --------------------------------- | ---------- | ---------- | -------------- | ------- | -------------- | ------------ |
| STPA MCP Framework                | 2601.08012 | 12         | 1              | 2       | 0.87           | **APPROVED** |
| AFlow (MCTS Workflows)            | 2410.10762 | 14         | 0              | 1       | 0.95           | **APPROVED** |
| SEW (Self-Evolving Workflows)     | 2505.18646 | 11         | 2              | 2       | 0.78           | **APPROVED** |
| ZeroRouter (Universal Difficulty) | TBD        | 10         | 3              | 2       | 0.72           | **APPROVED** |

### P2 Priority - Medium Impact

| Paper                            | arXiv ID   | Agents FOR | Agents AGAINST | ABSTAIN | Weighted Score | Decision     |
| -------------------------------- | ---------- | ---------- | -------------- | ------- | -------------- | ------------ |
| Higher-Order Voting (OW/ISP)     | 2510.01499 | 13         | 1              | 1       | 0.89           | **APPROVED** |
| Forest-of-Thought                | 2412.09078 | 11         | 2              | 2       | 0.78           | **APPROVED** |
| Agent-SafetyBench                | 2412.14470 | 10         | 3              | 2       | 0.72           | **APPROVED** |
| DAAO (VAE Difficulty)            | 2509.11079 | 9          | 4              | 2       | 0.67           | **APPROVED** |
| Evolving Orchestration (upgrade) | 2505.19591 | 12         | 2              | 1       | 0.83           | **APPROVED** |
| CASCAL (Annotation-free)         | 2601.09692 | 8          | 5              | 2       | 0.59           | DEFERRED     |
| Hindsight (Belief Memory)        | 2512.12818 | 11         | 2              | 2       | 0.78           | **APPROVED** |
| CMA (Temporal Chaining)          | 2601.09913 | 7          | 5              | 3       | 0.54           | DEFERRED     |
| CSE (Genetic Evolution)          | 2601.07348 | 6          | 6              | 3       | 0.47           | REJECTED     |
| Agent0 (Curriculum)              | 2511.16043 | 8          | 4              | 3       | 0.59           | DEFERRED     |
| Scaling Agent Systems            | 2512.08296 | 9          | 3              | 3       | 0.67           | **APPROVED** |
| CSCR (Contrastive Routing)       | TBD        | 8          | 4              | 3       | 0.59           | DEFERRED     |
| Focus (Autonomous Compression)   | TBD        | 7          | 5              | 3       | 0.54           | DEFERRED     |

### Monitor/P3+ - Future Consideration

| Paper       | arXiv ID | Status  | Rationale                             |
| ----------- | -------- | ------- | ------------------------------------- |
| MemR3       | TBD      | MONITOR | Low urgency, existing memory adequate |
| Arch-Router | TBD      | MONITOR | Current routing sufficient            |
| SAGE        | TBD      | MONITOR | Survey - no techniques                |
| ARTEMIS     | TBD      | MONITOR | Infrastructure-level, long-term       |

### Skip - Not Applicable

| Paper                     | Rationale                         |
| ------------------------- | --------------------------------- |
| Internal State Probing    | Requires model internals access   |
| Latent Reasoning          | Wrong architecture (single-model) |
| Reflection-Driven Control | Overlaps existing Reflexion       |
| Various surveys           | No extractable techniques         |

---

## Final Approved List for Implementation

### Immediate (P1 - Create Issues Now)

1. **STPA MCP Framework** (arxiv-2601.08012)
   - Technique: Formal STPA safety analysis for MCP tools
   - Integration: `src/mcp/safety/` + `src/security/`
   - Complexity: Medium
   - Est. Tests: 30+

2. **AFlow** (arxiv-2410.10762)
   - Technique: MCTS-based automatic workflow generation
   - Integration: `src/workflows/aflow/`
   - Complexity: High
   - Est. Tests: 40+

3. **SEW Self-Evolving Workflows** (arxiv-2505.18646)
   - Technique: Self-evolving workflow patterns
   - Integration: `src/workflows/self-evolving/`
   - Complexity: Medium
   - Est. Tests: 25+

4. **ZeroRouter Universal Difficulty**
   - Technique: Universal difficulty space for routing
   - Integration: `src/cli-adapters/zero-router.ts`
   - Complexity: Medium
   - Est. Tests: 20+

### Near-Term (P2 - Create Issues After P1)

5. **Higher-Order Voting (OW/ISP)** (arxiv-2510.01499)
   - Technique: Bayesian-optimal aggregation with correlation awareness
   - Integration: `src/consensus/higher-order-voting.ts`
   - Complexity: Medium
   - Est. Tests: 25+

6. **Forest-of-Thought** (arxiv-2412.09078)
   - Technique: Multi-tree reasoning with sparse activation
   - Integration: `src/agents/reasoning/forest-of-thought.ts`
   - Complexity: High
   - Est. Tests: 30+

7. **Agent-SafetyBench** (arxiv-2412.14470)
   - Technique: Safety evaluation suite integration
   - Integration: `src/security/safety-bench/`
   - Complexity: Medium
   - Est. Tests: 40+

8. **DAAO VAE Difficulty** (arxiv-2509.11079)
   - Technique: VAE-based difficulty estimation for routing
   - Integration: `src/cli-adapters/daao-estimator.ts`
   - Complexity: Medium
   - Est. Tests: 20+

9. **Evolving Orchestration Upgrade** (arxiv-2505.19591)
   - Technique: Puppeteer-style learned orchestration
   - Integration: `src/agents/orchestration/puppeteer.ts`
   - Complexity: High
   - Est. Tests: 35+
   - Note: Upgrade RL-Orchestrator from P4 to P2

10. **Hindsight Belief Memory** (arxiv-2512.12818)
    - Technique: Belief Memory layer for reasoning
    - Integration: `src/context/belief-memory.ts`
    - Complexity: Medium
    - Est. Tests: 20+

11. **Scaling Agent Systems** (arxiv-2512.08296)
    - Technique: Coordination predictor for multi-agent scaling
    - Integration: `src/agents/coordination/scaling-predictor.ts`
    - Complexity: Medium
    - Est. Tests: 25+

---

## Voting Summary

| Category     | Count | Percentage |
| ------------ | ----- | ---------- |
| **APPROVED** | 11    | 52%        |
| **DEFERRED** | 5     | 24%        |
| **REJECTED** | 1     | 5%         |
| **MONITOR**  | 4     | 19%        |

**Total Papers Reviewed:** 21+
**Papers Approved for Implementation:** 11
**Estimated New Techniques:** 11
**Estimated New Tests:** 290+

---

## Consensus Protocol Details

### Weighted Agent Scores (by expertise)

| Agent Type           | Weight | Specialty           |
| -------------------- | ------ | ------------------- |
| Consensus Specialist | 1.2    | Protocol evaluation |
| Routing Expert       | 1.1    | Routing papers      |
| Memory Systems       | 1.1    | Memory papers       |
| Code-Gen Expert      | 1.0    | Self-improvement    |
| Orchestration        | 1.1    | Coordination        |
| Security             | 1.2    | Safety-critical     |
| General              | 0.9    | Cross-cutting       |

### Decision Thresholds

- **APPROVED:** Weighted score ≥ 0.67 (supermajority)
- **DEFERRED:** Weighted score 0.50-0.66 (simple majority but not super)
- **REJECTED:** Weighted score < 0.50 (minority support)

---

_Generated by nexus-agents research swarm using CP-WBFT consensus protocol_
_Next review: After P1 implementations complete_
