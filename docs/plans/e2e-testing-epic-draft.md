# End-to-End Testing Epic - Draft Plan

**Created:** 2026-01-16 (ET)
**Status:** Draft - Awaiting Consensus Vote
**Epic:** Full System E2E Validation

---

## Executive Summary

Implement comprehensive end-to-end testing to validate all nexus-agents flows work correctly with real agent queries and data. Based on swarm exploration of 81+ files across 6 major subsystems, this plan addresses critical gaps in integration testing coverage.

### Current State

- **Unit Tests:** 500+ tests with good isolation
- **E2E Tests:** 1 file only (self-development workflow)
- **Integration Tests:** ~30 scattered tests
- **Gap:** No systematic E2E validation of cross-system interactions

### Target State

- Full E2E coverage across all 6 subsystems
- Real MCP protocol testing with actual tool invocations
- Multi-agent workflow validation
- Security boundary verification
- Performance baseline establishment

---

## Testing Scope

### Subsystem 1: MCP Server & Tools

**Priority:** P0 (Critical Path)
**Files:** 4 tools, 8 middleware, server lifecycle

| Test Category       | Tests | Description                                        |
| ------------------- | ----- | -------------------------------------------------- |
| Protocol Compliance | 5     | Tool discovery, schema validation, response format |
| Tool Execution      | 12    | All 4 tools E2E, chaining, error cases             |
| Rate Limiting       | 4     | Concurrent load, throttling behavior               |
| Timeout Protection  | 3     | CVE-2026-0621 mitigation validation                |
| Policy Enforcement  | 4     | Read-only mode, path traversal prevention          |

**Deliverables:**

- `src/mcp/e2e/protocol.e2e.test.ts`
- `src/mcp/e2e/tools.e2e.test.ts`
- `src/mcp/e2e/security.e2e.test.ts`

### Subsystem 2: Agent Framework

**Priority:** P0 (Critical Path)
**Files:** 3 agent types, 9 collaboration protocols, state machine

| Test Category             | Tests | Description                           |
| ------------------------- | ----- | ------------------------------------- |
| Task Lifecycle            | 8     | Validation → execution → cleanup      |
| Multi-Agent Orchestration | 6     | TechLead + experts coordination       |
| Collaboration Protocols   | 15    | Aegean, Reflexion, TRINITY validation |
| State Machine             | 6     | Transitions, timeouts, recovery       |
| Message Routing           | 5     | Inter-agent communication flows       |

**Deliverables:**

- `src/agents/e2e/lifecycle.e2e.test.ts`
- `src/agents/e2e/orchestration.e2e.test.ts`
- `src/agents/e2e/protocols.e2e.test.ts`

### Subsystem 3: CLI Adapters & Routing

**Priority:** P1 (Feature Critical)
**Files:** 3 adapters, 4-stage routing pipeline, circuit breaker

| Test Category       | Tests | Description                             |
| ------------------- | ----- | --------------------------------------- |
| Adapter Lifecycle   | 6     | Detection, version check, auth          |
| Routing Pipeline    | 10    | Full 4-stage: Budget→TOPSIS→LinUCB      |
| Budget Enforcement  | 8     | Session/task limits, warnings           |
| Learning Adaptation | 5     | LinUCB convergence, preference learning |
| Resilience          | 6     | Circuit breaker, fallback routing       |

**Deliverables:**

- `src/cli-adapters/e2e/adapters.e2e.test.ts`
- `src/cli-adapters/e2e/routing.e2e.test.ts`
- `src/cli-adapters/e2e/resilience.e2e.test.ts`

### Subsystem 4: Workflow Engine

**Priority:** P1 (Feature Critical)
**Files:** Parser, executor, LATTS, parallel execution

| Test Category        | Tests | Description                    |
| -------------------- | ----- | ------------------------------ |
| Workflow Lifecycle   | 6     | Load → plan → execute → report |
| Dependency Execution | 5     | DAG resolution, parallel steps |
| LATTS Adaptive       | 8     | Verify → decide → retry loop   |
| Error Recovery       | 4     | Step failures, cancellation    |
| Template Management  | 4     | Load, list, validate templates |

**Deliverables:**

- `src/workflows/e2e/lifecycle.e2e.test.ts`
- `src/workflows/e2e/latts.e2e.test.ts`
- `src/workflows/e2e/parallel.e2e.test.ts`

### Subsystem 5: Consensus & Voting

**Priority:** P1 (Architecture Critical)
**Files:** Engine, protocols, weighted voting, event emission

| Test Category       | Tests | Description                     |
| ------------------- | ----- | ------------------------------- |
| Voting Lifecycle    | 5     | Create → vote → resolve         |
| Protocol Selection  | 4     | Task-aware protocol routing     |
| Byzantine Tolerance | 4     | CP-WBFT adversarial scenarios   |
| Weight Updates      | 3     | Performance-based recalibration |
| Event Integration   | 4     | Consensus → EventBus flow       |

**Deliverables:**

- `src/consensus/e2e/voting.e2e.test.ts`
- `src/consensus/e2e/protocols.e2e.test.ts`

### Subsystem 6: Memory Systems

**Priority:** P2 (Quality Enhancement)
**Files:** 8 memory backends, token budget, event bus

| Test Category  | Tests | Description                        |
| -------------- | ----- | ---------------------------------- |
| Typed Memory   | 6     | 6-type queries, pruning, filtering |
| Session Memory | 4     | Cross-session persistence          |
| Graph Memory   | 4     | Relationship traversal             |
| Token Budget   | 5     | EMA tracking, enforcement          |
| Event Bus      | 5     | Full lifecycle, correlation IDs    |

**Deliverables:**

- `src/context/e2e/memory.e2e.test.ts`
- `src/context/e2e/budget.e2e.test.ts`
- `src/agents/collaboration/e2e/events.e2e.test.ts`

---

## Implementation Plan

### Phase 1: Infrastructure (Sprint 1)

**Duration:** 3-4 days
**Goal:** E2E test framework and fixtures

| Task                                                    | Effort  | Owner |
| ------------------------------------------------------- | ------- | ----- |
| Create E2E test utilities (Result assertions, timing)   | 1 day   | -     |
| Build mock infrastructure (adapters, agents, memory)    | 1 day   | -     |
| Create test fixtures (sample tasks, workflows, configs) | 1 day   | -     |
| Setup CI integration for E2E tests                      | 0.5 day | -     |

### Phase 2: Critical Path (Sprint 1-2)

**Duration:** 5-6 days
**Goal:** P0 subsystems fully tested

| Task                     | Effort | Owner |
| ------------------------ | ------ | ----- |
| MCP Protocol & Tools E2E | 2 days | -     |
| Agent Framework E2E      | 2 days | -     |
| Integration validation   | 1 day  | -     |

### Phase 3: Feature Critical (Sprint 2-3)

**Duration:** 6-7 days
**Goal:** P1 subsystems fully tested

| Task                       | Effort | Owner |
| -------------------------- | ------ | ----- |
| CLI Adapters & Routing E2E | 2 days | -     |
| Workflow Engine E2E        | 2 days | -     |
| Consensus & Voting E2E     | 2 days | -     |

### Phase 4: Quality Enhancement (Sprint 3)

**Duration:** 4-5 days
**Goal:** P2 subsystems and polish

| Task                    | Effort  | Owner |
| ----------------------- | ------- | ----- |
| Memory Systems E2E      | 2 days  | -     |
| Security boundary tests | 1 day   | -     |
| Performance baselines   | 1 day   | -     |
| Documentation           | 0.5 day | -     |

---

## Test Infrastructure

### Test Utilities (New)

```typescript
// src/testing/e2e/utils.ts
export const assertOk = <T>(result: Result<T, Error>): T => {...}
export const assertErr = <E>(result: Result<unknown, E>): E => {...}
export const measureLatency = async <T>(fn: () => Promise<T>): Promise<{result: T, ms: number}> => {...}
export const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {...}
```

### Mock Components (New)

```typescript
// src/testing/e2e/mocks/
MockCliAdapter; // Configurable responses, controllable failures
MockCircuitBreaker; // Manual state control
MockBudgetRouter; // Deterministic budget decisions
MockLinUCBBandit; // Deterministic arm selection
MockCollaborationSession; // Event emission verification
```

### Fixtures (New)

```
src/testing/e2e/fixtures/
├── tasks/           # Sample task definitions
├── workflows/       # Test workflow YAML files
├── configs/         # Configuration variants
├── responses/       # Mock CLI responses
└── errors/          # Error scenario definitions
```

---

## Success Metrics

| Metric                    | Current | Target  | Measurement         |
| ------------------------- | ------- | ------- | ------------------- |
| E2E Test Files            | 1       | 15+     | File count          |
| E2E Test Cases            | ~10     | 150+    | Test count          |
| Critical Path Coverage    | 0%      | 100%    | P0 subsystems       |
| Integration Points Tested | ~5%     | 80%     | Cross-system tests  |
| CI E2E Run Time           | N/A     | < 5 min | Pipeline metrics    |
| False Positive Rate       | N/A     | < 5%    | Flaky test tracking |

---

## Risk Assessment

| Risk                | Likelihood | Impact | Mitigation                       |
| ------------------- | ---------- | ------ | -------------------------------- |
| Test flakiness      | Medium     | High   | Deterministic mocks, retry logic |
| CI timeout          | Medium     | Medium | Parallel test execution, caching |
| Mock drift          | Low        | High   | Contract tests, regular sync     |
| Resource exhaustion | Low        | Medium | Resource limits, cleanup hooks   |

---

## GitHub Issues to Create

### Epic Issue

- **Title:** `epic: Comprehensive E2E Testing Suite`
- **Labels:** `epic`, `testing`, `quality`

### Phase 1 Issues

1. `test(e2e): create E2E test infrastructure and utilities`
2. `test(e2e): create mock components for E2E testing`
3. `test(e2e): create test fixtures and sample data`

### Phase 2 Issues (P0)

4. `test(e2e): MCP protocol compliance and tool execution`
5. `test(e2e): agent framework lifecycle and orchestration`
6. `test(e2e): collaboration protocols (Aegean, Reflexion, TRINITY)`

### Phase 3 Issues (P1)

7. `test(e2e): CLI adapters lifecycle and health checking`
8. `test(e2e): routing pipeline (Budget→TOPSIS→LinUCB)`
9. `test(e2e): workflow engine lifecycle and execution`
10. `test(e2e): LATTS adaptive compute integration`
11. `test(e2e): consensus voting and Byzantine tolerance`

### Phase 4 Issues (P2)

12. `test(e2e): memory systems integration (typed, graph, session)`
13. `test(e2e): token budget enforcement across operations`
14. `test(e2e): event bus lifecycle and correlation tracking`
15. `test(e2e): security boundary validation`

---

## Acceptance Criteria

### Epic Completion

- [ ] All 15 E2E test files created and passing
- [ ] 150+ E2E test cases covering all 6 subsystems
- [ ] CI pipeline includes E2E test stage (< 5 min)
- [ ] No critical path without E2E coverage
- [ ] Test documentation updated
- [ ] Performance baselines established

### Per-Issue Completion

- [ ] Tests written and passing
- [ ] Mocks/fixtures created as needed
- [ ] CI integration verified
- [ ] Coverage report updated
- [ ] PR reviewed and merged

---

## Appendix: Research Findings Summary

### Exploration Agents Used

1. **MCP Explorer** - Found 4 tools, 8 middleware, 28 E2E gaps
2. **Agent Explorer** - Found 3 agent types, 9 protocols, 40 E2E gaps
3. **CLI Explorer** - Found 3 adapters, 4-stage routing, 80+ E2E gaps
4. **Workflow Explorer** - Found parser, executor, LATTS, 27 E2E gaps
5. **Consensus/Memory Explorer** - Found 8 backends, voting, 84+ E2E gaps

### Total E2E Testing Gaps Identified: 250+

### Prioritized Tests in This Plan: 150 (critical subset)

---

_Draft Version 1.0 - Pending Consensus Vote_
