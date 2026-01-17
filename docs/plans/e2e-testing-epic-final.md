# End-to-End Testing Epic - Final Plan

**Created:** 2026-01-16 (ET)
**Status:** ✅ Consensus Approved (4/5 Supermajority)
**Epic:** Full System E2E Validation

---

## Consensus Voting Results

| Agent     | Vote    | Confidence | Key Feedback                                   |
| --------- | ------- | ---------- | ---------------------------------------------- |
| Architect | APPROVE | 8          | Add cross-subsystem integration tests          |
| Security  | DISSENT | 8          | Elevate security to P0, expand Byzantine tests |
| DevEx     | APPROVE | 8          | Centralize tests, use existing infrastructure  |
| AI/ML     | APPROVE | 7          | Add adaptive protocol selection tests          |
| PM        | APPROVE | 8          | Add owners, rollback criteria, prerequisites   |

**Resolution:** Security concerns addressed by elevating security E2E to Phase 2 (P0).

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
- Security boundary verification (P0, not P2)
- Performance baseline establishment

### Prerequisites

- **#271 (P0):** TimeoutGuard for CVE-2026-0621 mitigation must be complete before MCP E2E tests

---

## Testing Scope

### Subsystem 1: MCP Server & Tools

**Priority:** P0 (Critical Path)
**Files:** 4 tools, 8 middleware, server lifecycle

| Test Category       | Tests | Description                                         |
| ------------------- | ----- | --------------------------------------------------- |
| Protocol Compliance | 5     | Tool discovery, schema validation, response format  |
| Tool Execution      | 12    | All 4 tools E2E, chaining, error cases              |
| Rate Limiting       | 4     | Concurrent load, throttling behavior                |
| Timeout Protection  | 8     | CVE-2026-0621 mitigation (expanded per Security)    |
| Policy Enforcement  | 4     | Read-only mode, path traversal prevention           |
| Mode Detection      | 4     | Server/orchestrator/mesh mode paths (per Architect) |

**Deliverables:**

- `src/testing/e2e/mcp/protocol.e2e.test.ts`
- `src/testing/e2e/mcp/tools.e2e.test.ts`
- `src/testing/e2e/mcp/security.e2e.test.ts`

### Subsystem 2: Agent Framework

**Priority:** P0 (Critical Path)
**Files:** 3 agent types, 9 collaboration protocols, state machine

| Test Category               | Tests | Description                                      |
| --------------------------- | ----- | ------------------------------------------------ |
| Task Lifecycle              | 8     | Validation → execution → cleanup                 |
| Multi-Agent Orchestration   | 6     | TechLead + experts coordination                  |
| Collaboration Protocols     | 15    | Aegean, Reflexion, TRINITY validation            |
| State Machine               | 6     | Transitions, timeouts, recovery                  |
| Message Routing             | 5     | Inter-agent communication flows                  |
| Message Handlers            | 4     | BaseAgent handleMessage coverage (per Architect) |
| Adaptive Protocol Selection | 5     | Task-type classifier accuracy (per AI/ML)        |

**Deliverables:**

- `src/testing/e2e/agents/lifecycle.e2e.test.ts`
- `src/testing/e2e/agents/orchestration.e2e.test.ts`
- `src/testing/e2e/agents/protocols.e2e.test.ts`

### Subsystem 3: Security (ELEVATED from P2 to P0)

**Priority:** P0 (Critical Path) - Per Security Agent feedback
**Files:** Sandbox, validation, CVE mitigations

| Test Category         | Tests | Description                                   |
| --------------------- | ----- | --------------------------------------------- |
| CVE-2026-0621 Timeout | 8     | TimeoutGuard integration, cascade, concurrent |
| Path Traversal        | 6     | All file operations, symlinks, unicode        |
| Injection Prevention  | 6     | Command, YAML, prompt injection               |
| Sandbox Execution     | 8     | Docker lifecycle, policy fallback, limits     |
| Byzantine Detection   | 8     | Contrarian, collusion, recovery (expanded)    |

**Deliverables:**

- `src/testing/e2e/security/timeout.e2e.test.ts`
- `src/testing/e2e/security/sandbox.e2e.test.ts`
- `src/testing/e2e/security/injection.e2e.test.ts`
- `src/testing/e2e/security/byzantine.e2e.test.ts`

### Subsystem 4: CLI Adapters & Routing

**Priority:** P1 (Feature Critical)
**Files:** 3 adapters, 4-stage routing pipeline, circuit breaker

| Test Category            | Tests | Description                                               |
| ------------------------ | ----- | --------------------------------------------------------- |
| Adapter Lifecycle        | 6     | Detection, version check, auth                            |
| Routing Pipeline         | 10    | Full 4-stage: Budget→TOPSIS→LinUCB                        |
| Budget Enforcement       | 8     | Session/task limits, warnings                             |
| Learning Validation      | 8     | LinUCB convergence, weight evolution (expanded per AI/ML) |
| Preference Router        | 4     | Data accumulation, hasMinimumData() (per AI/ML)           |
| Resilience               | 6     | Circuit breaker, fallback routing                         |
| TaskAnalyzer Integration | 4     | TaskAnalyzer→CompositeRouter path (per Architect)         |

**Deliverables:**

- `src/testing/e2e/cli-adapters/adapters.e2e.test.ts`
- `src/testing/e2e/cli-adapters/routing.e2e.test.ts`
- `src/testing/e2e/cli-adapters/learning.e2e.test.ts`
- `src/testing/e2e/cli-adapters/resilience.e2e.test.ts`

### Subsystem 5: Workflow Engine

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

- `src/testing/e2e/workflows/lifecycle.e2e.test.ts`
- `src/testing/e2e/workflows/latts.e2e.test.ts`
- `src/testing/e2e/workflows/parallel.e2e.test.ts`

### Subsystem 6: Consensus & Voting

**Priority:** P1 (Architecture Critical)
**Files:** Engine, protocols, weighted voting, event emission

| Test Category      | Tests | Description                     |
| ------------------ | ----- | ------------------------------- |
| Voting Lifecycle   | 5     | Create → vote → resolve         |
| Protocol Selection | 4     | Task-aware protocol routing     |
| Weight Updates     | 3     | Performance-based recalibration |
| Event Integration  | 4     | Consensus → EventBus flow       |

**Deliverables:**

- `src/testing/e2e/consensus/voting.e2e.test.ts`
- `src/testing/e2e/consensus/protocols.e2e.test.ts`

### Subsystem 7: Memory Systems

**Priority:** P2 (Quality Enhancement)
**Files:** 8 memory backends, token budget, event bus

| Test Category  | Tests | Description                                        |
| -------------- | ----- | -------------------------------------------------- |
| Typed Memory   | 6     | 6-type queries, pruning, filtering                 |
| Session Memory | 4     | Cross-session persistence                          |
| Graph Memory   | 4     | Relationship traversal                             |
| Token Budget   | 5     | EMA tracking, enforcement                          |
| Event Bus      | 5     | Full lifecycle, correlation IDs (P1 per Architect) |

**Deliverables:**

- `src/testing/e2e/context/memory.e2e.test.ts`
- `src/testing/e2e/context/budget.e2e.test.ts`
- `src/testing/e2e/agents/events.e2e.test.ts`

### Cross-Subsystem Integration (NEW per Architect)

**Priority:** P1 (Architecture Critical)

| Test Category             | Tests | Description                     |
| ------------------------- | ----- | ------------------------------- |
| MCP→Agent→CLI Flow        | 6     | Full orchestration path         |
| Agent→Consensus→Memory    | 4     | Collaboration with persistence  |
| Routing→Learning→Feedback | 4     | Closed-loop learning validation |

**Deliverables:**

- `src/testing/e2e/integration/full-flow.e2e.test.ts`

---

## Implementation Plan

### Phase 1: Infrastructure (Sprint 1)

**Duration:** 3-4 days
**Goal:** E2E test framework and fixtures
**Rollback Criterion:** Infrastructure unusable for basic test execution

| Task                                                    | Effort  | Owner |
| ------------------------------------------------------- | ------- | ----- |
| Extend existing src/testing/e2e utilities (per DevEx)   | 1 day   | TBD   |
| Build mock infrastructure (adapters, agents, memory)    | 1 day   | TBD   |
| Create test fixtures (sample tasks, workflows, configs) | 1 day   | TBD   |
| Setup CI integration with vitest config (per DevEx)     | 0.5 day | TBD   |

### Phase 2: Critical Path + Security (Sprint 1-2)

**Duration:** 7-8 days
**Goal:** P0 subsystems including security fully tested
**Quick Win Milestone:** ✅ At day 8, all P0 tests pass
**Rollback Criterion:** MCP or Security tests >20% failing

| Task                                     | Effort | Owner |
| ---------------------------------------- | ------ | ----- |
| MCP Protocol & Tools E2E (requires #271) | 2 days | TBD   |
| Agent Framework E2E                      | 2 days | TBD   |
| Security E2E (elevated from Phase 4)     | 2 days | TBD   |
| Integration validation                   | 1 day  | TBD   |

### Phase 3: Feature Critical (Sprint 2-3)

**Duration:** 6-7 days
**Goal:** P1 subsystems fully tested
**Rollback Criterion:** Routing pipeline tests >30% failing

| Task                       | Effort | Owner |
| -------------------------- | ------ | ----- |
| CLI Adapters & Routing E2E | 2 days | TBD   |
| Workflow Engine E2E        | 2 days | TBD   |
| Consensus & Voting E2E     | 2 days | TBD   |

### Phase 4: Quality Enhancement (Sprint 3)

**Duration:** 3-4 days
**Goal:** P2 subsystems and cross-system integration
**Rollback Criterion:** Integration tests introduce flakiness >5%

| Task                              | Effort   | Owner |
| --------------------------------- | -------- | ----- |
| Memory Systems E2E                | 1.5 days | TBD   |
| Cross-subsystem integration tests | 1 day    | TBD   |
| Performance baselines             | 0.5 day  | TBD   |
| Documentation                     | 0.5 day  | TBD   |

---

## Test Infrastructure

### Test Structure (Centralized per DevEx)

```
src/testing/e2e/
├── mcp/              # MCP subsystem tests
├── agents/           # Agent subsystem tests
├── security/         # Security tests (P0)
├── cli-adapters/     # CLI routing tests
├── workflows/        # Workflow tests
├── consensus/        # Consensus tests
├── context/          # Memory/budget tests
├── integration/      # Cross-subsystem tests
├── utils/            # Shared utilities
├── mocks/            # Mock components
└── fixtures/         # Test data
```

### Test Utilities (Extend Existing)

```typescript
// src/testing/e2e/utils.ts - extend existing infrastructure
import { ScenarioRunner, AccuracyEval } from '../e2e-utils.js';

// Additional utilities
export const assertOk = <T>(result: Result<T, Error>): T => {...}
export const assertErr = <E>(result: Result<unknown, E>): E => {...}
export const measureLatency = async <T>(fn: () => Promise<T>) => {...}
export const withCleanup = async <T>(fn: () => Promise<T>, cleanup: () => Promise<void>) => {...}
```

### Vitest Configuration (per DevEx)

```typescript
// vitest.config.e2e.ts
export default defineConfig({
  test: {
    include: ['src/testing/e2e/**/*.e2e.test.ts'],
    pool: 'forks', // Isolation per test file
    testTimeout: 60000, // 60s for E2E tests
    hookTimeout: 30000, // 30s for setup/teardown
    bail: 5, // Fail fast after 5 failures
    reporters: ['verbose', 'json'],
  },
});
```

### Mock Components

```typescript
// src/testing/e2e/mocks/
MockCliAdapter; // Configurable responses, controllable failures
MockCircuitBreaker; // Manual state control
MockBudgetRouter; // Deterministic budget decisions
MockLinUCBBandit; // Deterministic arm selection, verifiable weight updates
MockCollaborationSession; // Event emission verification
MockSandbox; // Simulated container execution
```

### Test Data Cleanup Strategy (per DevEx)

```typescript
// Every E2E test file must implement cleanup
beforeEach(async () => {
  await resetTestState();
});

afterEach(async () => {
  await cleanupMemory();
  await cleanupSessions();
  await cleanupTempFiles();
});
```

---

## Success Metrics

| Metric                    | Current | Target  | Fallback | Measurement                                 |
| ------------------------- | ------- | ------- | -------- | ------------------------------------------- |
| E2E Test Files            | 1       | 18+     | -        | File count                                  |
| E2E Test Cases            | ~10     | 180+    | -        | Test count                                  |
| Critical Path Coverage    | 0%      | 100%    | -        | P0 subsystems                               |
| Security Test Coverage    | 0%      | 100%    | -        | Security subsystem                          |
| Integration Points Tested | ~5%     | 80%     | 70%      | Cross-system tests                          |
| CI E2E Run Time           | N/A     | < 5 min | < 8 min  | Pipeline metrics                            |
| False Positive Rate       | N/A     | < 5%    | < 8%     | Flaky test tracking via `@flaky` annotation |

### Flaky Test Tracking (per PM)

```typescript
// Mark flaky tests for tracking
describe.skip.if(process.env.SKIP_FLAKY)('flaky test', () => {...});

// Or use custom annotation
it.flaky('sometimes fails due to timing', async () => {...});
```

---

## Risk Assessment

| Risk                     | Likelihood | Impact | Mitigation                                            |
| ------------------------ | ---------- | ------ | ----------------------------------------------------- |
| Test flakiness           | Medium     | High   | Deterministic mocks, cleanup hooks, `@flaky` tracking |
| CI timeout               | Medium     | Medium | Parallel shards, < 8 min fallback target              |
| Mock drift               | Low        | High   | Contract tests, regular sync                          |
| Resource exhaustion      | Low        | Medium | Resource limits, cleanup hooks                        |
| Docker unavailable in CI | Medium     | Medium | Policy mode fallback for sandbox tests                |

---

## GitHub Issues to Create

### Epic Issue

- **Title:** `epic: Comprehensive E2E Testing Suite`
- **Labels:** `epic`, `testing`, `quality`

### Phase 1 Issues (Infrastructure)

1. `test(e2e): create E2E test infrastructure and utilities`
2. `test(e2e): create mock components for E2E testing`
3. `test(e2e): create test fixtures and sample data`

### Phase 2 Issues (P0 Critical Path + Security)

4. `test(e2e): MCP protocol compliance and tool execution` (depends on #271)
5. `test(e2e): agent framework lifecycle and orchestration`
6. `test(e2e): collaboration protocols (Aegean, Reflexion, TRINITY)`
7. `test(e2e): security boundaries, CVE mitigations, Byzantine detection` (NEW - P0)

### Phase 3 Issues (P1 Feature Critical)

8. `test(e2e): CLI adapters lifecycle and health checking`
9. `test(e2e): routing pipeline with LinUCB learning validation`
10. `test(e2e): workflow engine lifecycle and LATTS execution`
11. `test(e2e): consensus voting and adaptive protocol selection`

### Phase 4 Issues (P2 Quality)

12. `test(e2e): memory systems integration (typed, graph, session)`
13. `test(e2e): token budget enforcement and EMA tracking`
14. `test(e2e): event bus lifecycle and correlation tracking`
15. `test(e2e): cross-subsystem integration flows`

---

## Acceptance Criteria

### Epic Completion

- [ ] All 18 E2E test files created and passing
- [ ] 180+ E2E test cases covering all 7 subsystems + integration
- [ ] CI pipeline includes E2E test stage (< 8 min with fallback)
- [ ] No critical path without E2E coverage
- [ ] Security tests at P0 level (all passing)
- [ ] Test documentation updated
- [ ] Performance baselines established
- [ ] Flaky test tracking enabled

### Per-Issue Completion

- [ ] Tests written and passing
- [ ] Mocks/fixtures created as needed
- [ ] Cleanup hooks implemented
- [ ] CI integration verified
- [ ] Coverage report updated
- [ ] PR reviewed and merged

---

## Appendix: Consensus Amendments Incorporated

### From Architect Agent

- ✅ Added cross-subsystem integration tests (Subsystem 8)
- ✅ Added event-bus tests to P1
- ✅ Added BaseAgent message handler tests
- ✅ Added TaskAnalyzer→CompositeRouter integration tests
- ✅ Added mode detection tests to MCP subsystem

### From Security Agent (DISSENT → Resolved)

- ✅ Elevated security E2E to P0 (Phase 2)
- ✅ Expanded CVE-2026-0621 timeout tests (3→8)
- ✅ Expanded Byzantine scenarios (4→8)
- ✅ Added injection testing category (6 tests)
- ✅ Added path traversal E2E tests (6 tests)
- ✅ Added sandbox execution E2E (8 tests)

### From DevEx Agent

- ✅ Centralized test structure in `src/testing/e2e/`
- ✅ Added vitest configuration details
- ✅ Added test data cleanup strategy
- ✅ Extended existing testing infrastructure

### From AI/ML Agent

- ✅ Added adaptive protocol selection tests (5 tests)
- ✅ Expanded LinUCB learning validation (5→8 tests)
- ✅ Added preference router data accumulation tests (4 tests)

### From PM Agent

- ✅ Added Owner column with TBD (to be assigned before sprint)
- ✅ Added rollback criteria per phase
- ✅ Marked #271 as prerequisite for MCP E2E
- ✅ Added Quick Win milestone at Phase 2 completion
- ✅ Added fallback CI target (< 8 min)
- ✅ Added flaky test tracking mechanism

---

## Appendix: Research Findings Summary

### Exploration Agents Used

1. **MCP Explorer** - Found 4 tools, 8 middleware, 28 E2E gaps
2. **Agent Explorer** - Found 3 agent types, 9 protocols, 40 E2E gaps
3. **CLI Explorer** - Found 3 adapters, 4-stage routing, 80+ E2E gaps
4. **Workflow Explorer** - Found parser, executor, LATTS, 27 E2E gaps
5. **Consensus/Memory Explorer** - Found 8 backends, voting, 84+ E2E gaps

### Total E2E Testing Gaps Identified: 250+

### Prioritized Tests in This Plan: 180 (critical subset with security elevated)

---

_Final Version 1.0 - Consensus Approved 2026-01-16 (4/5 Supermajority)_
