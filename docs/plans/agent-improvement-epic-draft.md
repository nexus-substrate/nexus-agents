# Agent Improvement Epic - Plan v2

**Generated:** 2026-01-16 (ET)
**Status:** Consensus Round 1 Complete - UNANIMOUS APPROVE (5/5)
**Research Basis:** 5-Agent Swarm Analysis (Phase 1-2)

---

## Consensus History

### Round 1 (2026-01-16)

| Agent     | Vote    | Confidence |
| --------- | ------- | ---------- |
| Architect | APPROVE | 85%        |
| Security  | APPROVE | 78%        |
| DevEx     | APPROVE | 78%        |
| AI/ML     | APPROVE | 85%        |
| PM        | APPROVE | 82%        |

**Result:** UNANIMOUS (5/5) - Exceeds supermajority threshold
**Amendments Incorporated:** 12 (see changelog below)

---

## Executive Summary

Based on comprehensive swarm analysis of 47,479 lines of agent framework code across 81 source files, this epic addresses 10 identified architectural weaknesses while leveraging our 96% research technique coverage (25/27 techniques implemented).

**Goal:** Transform nexus-agents from a capable multi-agent system into the best possible swarm orchestration framework.

---

## Research Findings Summary

### Current Strengths (Preserve)

- 9 collaboration protocols implemented with 200+ tests
- Byzantine fault tolerance (CP-WBFT, Aegean, MAR)
- 3-stage intelligent routing (Budget → TOPSIS → LinUCB)
- Event bus enabling zero-roundtrip A2A communication
- TRINITY role-based coordination pattern
- 6-type memory system (MIRIX)

### Critical Gaps Identified

| Priority | Gap                                         | Impact                                                         |
| -------- | ------------------------------------------- | -------------------------------------------------------------- |
| P1       | State machine not integrated into BaseAgent | Invalid state transitions possible                             |
| P1       | Tool access control not enforced            | Security risk                                                  |
| P1       | No token budget enforcement                 | **DoS risk via resource exhaustion** _(upgraded per Security)_ |
| P2       | Custom experts not loadable (#300)          | User can't extend system                                       |
| P2       | TRINITY not composable with other protocols | Limits orchestration flexibility                               |
| P3       | Naive FIFO history management               | Context inefficiency                                           |
| P4       | No RL-trained orchestrator (#154)           | Suboptimal agent selection                                     |

---

## Proposed Improvements

### Tier 1: Foundation Hardening (P1)

#### 1.1 Integrate AgentStateMachine into BaseAgent

**Issue:** State transitions in BaseAgent are ad-hoc strings, not validated against AgentStateMachine.

**Change:**

```typescript
// BaseAgent should use AgentStateMachine for validated transitions
private stateMachine: AgentStateMachine;

async execute(task: Task): Promise<Result<TaskResult, AgentError>> {
  const transitionResult = this.stateMachine.transition('thinking');
  if (!transitionResult.ok) {
    return { ok: false, error: new AgentError(transitionResult.error.message) };
  }
  // ... execution logic
}
```

**Files:** `packages/nexus-agents/src/agents/base-agent.ts`
**Tests:** Validate all state transitions, test invalid transition rejection
**Effort:** Medium

#### 1.2 Enforce Tool Access Control

**Issue:** `allowedTools` in AgentConfig is defined but never enforced during execution.

**Change:**

- Add tool validation in BaseAgent before tool execution
- Reject unauthorized tool calls with clear error (fail-closed behavior)
- **Add structured audit logging** _(Security amendment)_:
  ```typescript
  interface ToolAccessViolation {
    timestamp: string; // ISO 8601
    agentId: string;
    attemptedTool: string;
    allowedTools: string[];
    context: { taskId: string; sessionId: string };
  }
  ```
- Log to dedicated security audit channel with retention policy

**Files:** `packages/nexus-agents/src/agents/base-agent.ts`
**Tests:** Test tool filtering, unauthorized access rejection, audit log format
**Effort:** Low

#### 1.3 Token Budget Enforcement _(upgraded from P2 per Security)_

**Issue:** ContextBudget defines limits but they're not enforced, enabling DoS via resource exhaustion.

**Change:**

- Track token usage during agent execution using exponential moving average _(AI/ML amendment)_
- Implement budget checking before model calls
- **Default behavior: warn** with explicit opt-in for hard-stop _(DevEx amendment)_
- Add budget prediction to pre-emptively route to efficient models

**Files:**

- `packages/nexus-agents/src/agents/base-agent.ts`
- `packages/nexus-agents/src/context/token-counter.ts`
  **Tests:** Budget tracking, enforcement behavior, EMA calculation
  **Effort:** Medium

### Tier 2: User-Facing Features (P2)

#### 2.1 Custom Expert Configuration (#300) _(moved to front of Phase B per PM)_

**Issue:** Line 183 in expert-list.ts: `const custom: ExpertDefinition[] = [];  // TODO: Load from config`

**Change:**

- Add `experts.custom` section to config schema
- Load custom expert definitions from nexus-agents.yaml
- **Prompt sanitization and validation** _(Security amendment)_:
  - Maximum systemPrompt length: 4000 characters
  - Validate tier is one of: fast, balanced, powerful
  - Check tier-to-capability compatibility
  - Sanitize prompts for injection patterns
- **Actionable validation errors** _(DevEx amendment)_:
  ```
  Error: Invalid tier 'super' for expert 'rust_expert'.
  Valid options: fast, balanced, powerful
  ```
- Register custom experts alongside built-ins
- Rate limit custom expert instantiation

**Config Schema Addition:**

```yaml
experts:
  custom:
    rust_expert:
      name: 'Rust Expert'
      description: 'Specialized in Rust development'
      systemPrompt: 'You are a Rust expert...' # max 4000 chars
      tier: powerful # Validated: fast | balanced | powerful
      capabilities: [code_review, implementation]
    ml_expert:
      name: 'ML Expert'
      description: 'Machine learning specialist'
      systemPrompt: 'You are an ML expert...'
      tier: balanced
      capabilities: [architecture, code_review]
```

**Files:**

- `packages/nexus-agents/src/config/schemas.ts`
- `packages/nexus-agents/src/cli/expert-list.ts`
- `packages/nexus-agents/src/agents/experts/expert-registry.ts`
  **Tests:** Config parsing, custom expert instantiation, prompt validation, injection prevention
  **Documentation:** "Getting Started with Custom Experts" guide with copy-paste examples _(DevEx)_
  **Success Metric:** Time to first custom expert < 5 minutes _(PM)_
  **Effort:** Medium

#### 2.2 TRINITY as ICollaborationProtocol

**Issue:** TrinityCoordinator doesn't implement ICollaborationProtocol, limiting composability.

**Change:**

- Refactor TrinityCoordinator to implement ICollaborationProtocol interface
- **Add 'trinity' to CollaborationPattern type** _(Architect amendment)_:
  ```typescript
  type CollaborationPattern =
    | 'sequential'
    | 'parallel'
    | 'review'
    | 'consensus'
    | 'reflexion'
    | 'aegean'
    | 'self-refine'
    | 'self-debug'
    | 'trinity'; // NEW
  ```
- Enable TRINITY to be selected by AdaptiveProtocolSelector
- Allow TRINITY to be composed with other protocols (e.g., Reflexion for verification)

**Files:**

- `packages/nexus-agents/src/agents/collaboration/trinity-coordinator.ts`
- `packages/nexus-agents/src/core/types/workflow.ts` (pattern type)
  **Tests:** Protocol interface compliance, selector integration
  **Effort:** Medium

### Tier 3: Optimization (P3)

#### 3.1 Replace FIFO History with ContextPruner

**Issue:** History management in BaseAgent uses naive FIFO, losing important context.

**Change:**

- Use existing ContextPruner with priority_weighted_age strategy
- Preserve high-priority messages (system, errors, key decisions)
- Implement semantic relevance scoring for context retention

**Files:** `packages/nexus-agents/src/agents/base-agent.ts`
**Tests:** Context preservation under pressure, semantic relevance
**Effort:** Low (ContextPruner already exists)

#### 3.2 Distributed Message Routing

**Issue:** Message routing through centralized channels creates bottleneck.

**Dependency:** Requires 2.2 (TRINITY as ICollaborationProtocol) for EventBus patterns _(Architect amendment)_

**Change:**

- Leverage existing EventBus for direct agent-to-agent messaging
- Implement message priorities and routing rules
- Add dead-letter handling for undeliverable messages

**Files:**

- `packages/nexus-agents/src/agents/collaboration/event-bus.ts`
- `packages/nexus-agents/src/agents/base-agent.ts`
  **Tests:** Message delivery, priority handling, dead-letter
  **Effort:** Medium

### Tier 4: Advanced (P4) _(Stretch goal - defer if sprints exceed 6 per PM)_

#### 4.1a LinUCB-Based Agent Selection (#154 Phase 1)

**Issue:** Agent selection is rule-based, not learning-based.

**Change (Phase 1 - reuse existing infrastructure):**

- Reuse LinUCBBandit from cli-adapters for agent selection
- **Define reward signal composition** _(AI/ML amendment)_:
  ```typescript
  reward = taskCompletion * 0.4 + qualityScore * 0.3 + efficiency * 0.2 + resourceUtilization * 0.1;
  ```
- **Add alpha annealing schedule** _(AI/ML amendment)_:
  ```typescript
  alpha_t = alpha_0 / Math.sqrt(t); // After initial exploration
  ```
- **Warm-start from historical data** _(AI/ML amendment)_:
  - Bootstrap from existing FeedbackIntegration outcome data
  - Accelerates initial learning phase

**Files:**

- `packages/nexus-agents/src/agents/orchestrator/linucb-selector.ts`
- `packages/nexus-agents/src/learning/feedback-integration.ts`
  **Tests:** Reward computation, alpha decay, warm-start accuracy
  **Effort:** Medium

#### 4.1b Full RL Policy Training (#154 Phase 2) _(Deferred post-epic per Architect)_

**Issue:** LinUCB may be insufficient for complex orchestration decisions.

**Change (Phase 2 - future work):**

- Consider Thompson Sampling for non-stationary environments
- Add meta-learner for exploration strategy selection
- Full policy gradient training if needed

**Files:** `packages/nexus-agents/src/agents/orchestrator/`
**Effort:** High
**Dependency:** 4.1a must prove value before investing in 4.1b

---

## Implementation Roadmap

### Phase A: Foundation (Issues 1.1, 1.2, 1.3)

**Duration:** 1.5 sprints
**Outcome:** Hardened agent base with validated state, secure tool access, and budget enforcement
**Documentation:** Update ARCHITECTURE.md with state machine integration

### Phase B: User Features (Issues 2.1, 2.2) _(reordered per PM - #300 first)_

**Duration:** 2 sprints
**Outcome:** Custom experts (headline feature), composable TRINITY
**Documentation:**

- "Getting Started with Custom Experts" guide
- API reference for ICollaborationProtocol

### Phase C: Optimization (Issues 3.1, 3.2)

**Duration:** 1 sprint
**Prerequisite:** Phase B (2.2) must be complete before 3.2
**Outcome:** Efficient context management, scalable messaging
**Documentation:** Update observability guide with message routing patterns

### Phase D: Advanced (Issue 4.1a) _(Stretch goal per PM)_

**Duration:** 1-2 sprints
**Condition:** Only proceed if Phases A-C complete within 4.5 sprints
**Outcome:** Learning-based agent selection with LinUCB
**Documentation:** RL orchestrator configuration and tuning guide

---

## Success Metrics

| Metric                          | Current    | Target            | Measurement         |
| ------------------------------- | ---------- | ----------------- | ------------------- |
| State transition errors         | Unknown    | 0                 | Error logs          |
| Unauthorized tool access        | Unknown    | 0                 | Security audit logs |
| Tool access violations logged   | No         | 100%              | Audit log coverage  |
| Custom experts configurable     | No         | Yes               | Config test         |
| Time to first custom expert     | N/A        | < 5 min           | User testing _(PM)_ |
| Custom expert prompt validation | No         | Yes               | Security test       |
| TRINITY composability           | No         | Yes               | Protocol selector   |
| Token budget adherence          | No         | Warn by default   | Budget tests        |
| Context efficiency              | FIFO       | Priority-weighted | Token usage         |
| Agent selection accuracy        | Rule-based | Learning (LinUCB) | Outcome tracking    |

---

## Risk Assessment

| Risk                                            | Mitigation                                 |
| ----------------------------------------------- | ------------------------------------------ |
| State machine integration breaks existing tests | Incremental refactor with feature flag     |
| Custom expert config complexity                 | Start with minimal schema, iterate         |
| Token counting overhead                         | Cache counts, batch operations             |
| RL training instability                         | Use proven LinUCB pattern, gradual rollout |

---

## Dependencies

```
1.1 State Machine → 1.2 Tool Access (same file)
1.2 Tool Access → 1.3 Token Budget (shared base-agent.ts patterns)
2.1 Custom Experts → standalone (headline feature, do first in Phase B)
2.2 TRINITY Protocol → standalone
3.1 Context Pruner → standalone
3.2 Message Routing → 2.2 (EventBus patterns) ← Architect amendment
4.1a LinUCB Selection → 1.3 (outcome tracking from budget enforcement)
4.1b Full RL → 4.1a (must prove LinUCB value first) ← Deferred post-epic
```

---

## Voting Questions Resolved (Round 1)

| Question               | Consensus Answer                                                   |
| ---------------------- | ------------------------------------------------------------------ |
| Priority Order (P1→P4) | ✅ Approved - Token budget upgraded to P1 per Security             |
| Phase D Scope          | ✅ Include as stretch goal, split into 4.1a/4.1b per Architect     |
| Custom Experts Schema  | ✅ Approved with security amendments (prompt length, sanitization) |
| TRINITY Refactor       | ✅ Approved - add 'trinity' pattern type per Architect             |
| Token Budget Behavior  | ✅ Default to warn, opt-in hard-stop per DevEx                     |

---

## Changelog

### v2 (2026-01-16) - Post Round 1 Consensus

**Amendments Incorporated: 12**

| #   | Source    | Amendment                                                 |
| --- | --------- | --------------------------------------------------------- |
| 1   | Architect | Add 'trinity' to CollaborationPattern type                |
| 2   | Architect | Make 3.2 dependency on 2.2 explicit                       |
| 3   | Architect | Split 4.1 into 4.1a (LinUCB) and 4.1b (full RL, deferred) |
| 4   | Security  | Add prompt sanitization for custom experts                |
| 5   | Security  | Upgrade token budget to P1 (DoS risk)                     |
| 6   | Security  | Specify structured audit log format                       |
| 7   | Security  | Add max systemPrompt length (4000 chars)                  |
| 8   | DevEx     | Add actionable validation error messages                  |
| 9   | DevEx     | Add documentation requirements per phase                  |
| 10  | DevEx     | Default token budget to warn (not hard-stop)              |
| 11  | AI/ML     | Define reward signal composition                          |
| 12  | AI/ML     | Add alpha annealing schedule                              |
| 13  | AI/ML     | Add warm-start from historical data                       |
| 14  | PM        | Move #300 to front of Phase B                             |
| 15  | PM        | Add "time to first custom expert" metric                  |
| 16  | PM        | Mark Phase D as stretch goal                              |

### v1 (2026-01-16) - Initial Draft

- 5-agent swarm research completed
- 10 architecture weaknesses identified
- 7 improvements proposed across 4 priority tiers

---

_Plan v2 - Round 1 Consensus Complete (UNANIMOUS 5/5)_

---

## GitHub Issues Created

**Epic:** #301 - Agent Framework Improvements - Foundation to Learning

### Phase A (P1)

- #302 - Integrate AgentStateMachine into BaseAgent (1.1)
- #303 - Enforce tool access control with audit logging (1.2)
- #304 - Token budget enforcement with EMA tracking (1.3)

### Phase B (P2)

- #300 - Load custom experts from config (2.1) - **Headline feature**
- #305 - TRINITY as ICollaborationProtocol (2.2)

### Phase C (P3)

- #306 - Replace FIFO history with ContextPruner (3.1)
- #307 - Distributed message routing via EventBus (3.2)

### Phase D (P4 - Stretch)

- #154 - RL-trained orchestrator Phase 1 (4.1a)
