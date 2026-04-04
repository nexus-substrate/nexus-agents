# System Redundancy Analysis

> Generated: 2026-01-29
> Updated: 2026-01-31
> Source: System Mandate Loop H - Redundancy & Duplication Discovery

## Consolidation Progress (as of 2026-01-31)

| Item                       | Status      | Commits/Issues            |
| -------------------------- | ----------- | ------------------------- |
| Token estimation           | ✅ COMPLETE | 11fadd6, 06724b5, 45abf43 |
| toError utility            | ✅ COMPLETE | ecdf0e3                   |
| Error message hints        | ✅ COMPLETE | d4346a7                   |
| OrchestrationObserver wire | ✅ COMPLETE | Issue #587, 03d97a2       |
| CommandResult base type    | ✅ COMPLETE | Issue #584, 765d6a9       |
| Task analyzer migration    | ✅ COMPLETE | Issue #586 (CLOSED)       |
| Layer separation           | ✅ COMPLETE | Issue #588                |
| Consensus caching          | ✅ COMPLETE | Issue #589 (CLOSED)       |

**Fitness Score:** 92/100 ✓ (target: 90+)

## Executive Summary

The nexus-agents codebase contains **significant architectural redundancy** across four major subsystems:

| Subsystem        | Redundant Lines | Files Affected | Consolidation Priority |
| ---------------- | --------------- | -------------- | ---------------------- |
| Routing          | ~800            | 15+            | HIGH                   |
| Memory/Context   | ~1,200          | 20+            | HIGH                   |
| Consensus/Voting | ~800            | 12+            | MEDIUM                 |
| Orchestration    | ~2,970          | 23+            | CRITICAL               |
| **TOTAL**        | **~5,770**      | **70+**        |                        |

## 1. Routing Subsystem Redundancies

### 1.1 Router Inventory (10 implementations)

| Router                 | Location                                   | Purpose            | Overlap              |
| ---------------------- | ------------------------------------------ | ------------------ | -------------------- |
| TaskRouter             | `router.ts`                                | Capability-based   | HIGH with ZeroRouter |
| QualityRouter          | `adapters/quality-router.ts`               | Cost/quality       | HIGH with TOPSIS     |
| BudgetRouter           | `cli-adapters/budget-router.ts`            | Token/cost budgets | MEDIUM               |
| ConfidenceRouter       | `cli-adapters/confidence-router.ts`        | Cascade escalation | HIGH with Agreement  |
| ZeroRouter             | `cli-adapters/zero-router.ts`              | Difficulty space   | HIGH with Task       |
| PreferenceRouter       | `cli-adapters/preference-router.ts`        | Human preference   | LOW                  |
| TopsisRouter           | `cli-adapters/topsis-router.ts`            | Multi-criteria     | MEDIUM               |
| AgreementCascadeRouter | `cli-adapters/agreement-cascade-router.ts` | Model agreement    | HIGH with Confidence |
| CompositeRouter        | `cli-adapters/composite-router.ts`         | Pipeline           | ORCHESTRATOR         |

### 1.2 Critical Overlaps

**Task Analysis Duplication:**

- `TaskRouter` and `ZeroRouter` both call `analyzeTask()` identically
- ~~Token estimation duplicated in 3+ places~~ **CONSOLIDATED** (commits 11fadd6, 06724b5, 45abf43)
  - All adapters now use unified `getTokenEstimator()` from core
- ~150 lines of duplicate analysis code (Issue #586 tracks SharedTaskAnalyzer migration)

**Cascade Pattern Duplication:**

- `ConfidenceRouter`: Fast→Expensive escalation (SATER pattern)
- `AgreementCascadeRouter`: Multi-model stages (arxiv:2410.10347)
- ~300 lines of similar cascade logic

**Capability Matching Duplication:**

- `CAPABILITY_MATRIX` in router-scoring.ts
- `getCapabilityWeights()` in quality-router.ts
- TOPSIS criteria in topsis-router.ts
- 3 different scoring approaches for same problem

### 1.3 Consolidation Recommendation

```
CANONICAL: CompositeRouter (pipeline orchestrator)
CONSOLIDATE INTO:
  - SharedTaskAnalyzer (unified analysis)
  - UnifiedRoutingDecision (standardized output)
  - CascadeRouterBase (abstract cascade pattern)
  - TokenEstimator (single implementation)
```

---

## 2. Memory/Context Subsystem Redundancies

### 2.1 Dual Token Counting Systems

| System         | Location                    | Approach                     |
| -------------- | --------------------------- | ---------------------------- |
| ContextManager | `agents/context-manager.ts` | Running totals (O(1))        |
| Adapters       | `adapters/base-adapter.ts`  | Per-request counting         |
| Fallback       | Multiple                    | `Math.ceil(text.length / 4)` |

**Risk:** Synchronization drift between running totals and actual counts.

### 2.2 Multiple Pruning Mechanisms (4 systems)

| System              | Location                       | Strategy                          |
| ------------------- | ------------------------------ | --------------------------------- |
| ContextPruner       | `agents/context-pruner.ts`     | 7 strategies (OLDEST_FIRST, etc.) |
| Memory Backend      | `context/memory-operations.ts` | TTL-based expiry                  |
| TypedMemory         | `context/typed-memory.ts`      | Per-module pruning                |
| HybridMemoryBackend | `context/memory-backend.ts`    | FTS trigger cleanup               |

**Problem:** No unified pruning interface; each layer prunes independently.

### 2.3 Overlapping Persistence (5 systems)

| System              | Location                              | Storage               |
| ------------------- | ------------------------------------- | --------------------- |
| AgentMemoryState    | `agents/memory-operations.ts`         | IMemoryBackend        |
| Task Persistence    | `agents/base-agent-memory-helpers.ts` | Task-specific wrapper |
| SessionMemory       | `context/session-memory.ts`           | YAML files            |
| HybridMemoryBackend | `context/memory-backend.ts`           | SQLite + FTS5         |
| TypedMemory         | `context/typed-memory.ts`             | 6 separate modules    |

**Problem:** Same data can exist in multiple places with different schemas.

### 2.4 Consolidation Recommendation

```
CANONICAL: HybridMemoryBackend (SQLite-based)
CONSOLIDATE INTO:
  - IPruneStrategy interface (single pruning abstraction)
  - Unified Importance enum (replace 3 priority systems)
  - TypedMemory as single source of truth
  - YAML export on demand (not parallel storage)
```

---

## 3. Consensus/Voting Subsystem Redundancies

### 3.1 Three Voting Implementations

| System            | Location                           | Purpose                   | Lines |
| ----------------- | ---------------------------------- | ------------------------- | ----- |
| VotingProtocol    | `consensus/voting-protocol.ts`     | 3-round code review       | 412   |
| WeightedVoting    | `consensus/weighted-voting.ts`     | Byzantine fault tolerance | 362   |
| HigherOrderVoting | `consensus/higher-order-voting.ts` | Correlation-aware         | 262   |

### 3.2 Quorum Logic Duplication

| Implementation  | Location               | Approach                  |
| --------------- | ---------------------- | ------------------------- |
| VotingProtocol  | voting-protocol.ts:296 | Unanimous (all must vote) |
| WeightedVoting  | weighted-voting.ts:108 | Weight threshold (0.67)   |
| ConsensusEngine | engine.ts:332          | Required voters list      |

**Problem:** Three different quorum semantics with no shared abstraction.

### 3.3 Agent Performance Duplication

| System          | Location           | Tracked                                         |
| --------------- | ------------------ | ----------------------------------------------- |
| WeightedVoting  | weighted-voting.ts | totalTasks, successfulTasks, weight, trustScore |
| ConsensusEngine | engine.ts:161      | totalVotes, correctVotes, successRate           |

**Problem:** Two incompatible performance models for same purpose.

### 3.4 Consolidation Recommendation

```
CANONICAL: ConsensusEngine (generic voting)
CONSOLIDATE INTO:
  - QuorumValidator (unified quorum checking)
  - VoteAggregator (shared outcome determination)
  - AgentPerformanceModel (unified tracking)
  - Register HigherOrderVoting in VotingStrategyFactory
```

---

## 4. Orchestration Subsystem Redundancies (CRITICAL)

### 4.1 Three Independent Orchestrators

| System                | Location                                         | Model              | Lines |
| --------------------- | ------------------------------------------------ | ------------------ | ----- |
| Orchestrator          | `agents/tech-lead.ts`                            | LLM-based planning | 472   |
| PuppeteerOrchestrator | `agents/orchestration/puppeteer-orchestrator.ts` | Learned policies   | 401   |
| WorkflowEngine        | `workflows/workflow-engine.ts`                   | Static definitions | 305   |

**Total:** ~1,400 lines of orchestration logic with 60% overlap.

### 4.2 All Three Implement Same Core Loop

```
1. Task analysis / state assessment
2. Agent selection
3. Step execution
4. Result aggregation
5. Termination detection
```

### 4.3 Duplicate Subsystems

| Subsystem       | Orchestrator                  | Puppeteer                   | Workflow         | Lines |
| --------------- | ----------------------------- | --------------------------- | ---------------- | ----- |
| Decomposition   | tech-lead-decomposition.ts    | trajectory-based            | phase-based      | 320   |
| Context         | implicit                      | PuppeteerState              | ExecutionContext | 480   |
| Agent Selection | tech-lead-expert-selection.ts | policy-scoring.ts           | step-executor.ts | 350   |
| Execution       | expert.execute()              | puppeteer-step-execution.ts | step-executor.ts | 420   |

### 4.4 Consolidation Recommendation

```
CANONICAL: Define IOrchestrator interface
IMPLEMENTATIONS:
  - Orchestrator (planning-based)
  - PuppeteerOrchestrator (policy-based)
  - WorkflowOrchestrator (definition-based)

SHARED ABSTRACTIONS:
  - ExecutionContext (unified state tracking)
  - AgentMatcher (unified selection)
  - StepExecutionPipeline (shared execution)
```

---

## 5. Canonical System Definitions

Per mandate, each core function must have ONE canonical implementation:

| Function             | Canonical                | Alternatives (Deprecate/Wrap)                           |
| -------------------- | ------------------------ | ------------------------------------------------------- |
| Tool Registry        | MCP Tools (`mcp/tools/`) | -                                                       |
| Routing Layer        | CompositeRouter          | TaskRouter, QualityRouter (wrap)                        |
| Memory Persistence   | HybridMemoryBackend      | SessionMemory (deprecate)                               |
| Voting/Consensus     | ConsensusEngine          | VotingProtocol (specialized), WeightedVoting (strategy) |
| Orchestration        | IOrchestrator interface  | Orchestrator, Puppeteer, Workflow (implementations)     |
| Governance Injection | TBD (Issue #569)         | -                                                       |

---

## 6. Consolidation Roadmap

### Phase 1: Low Risk (Week 1-2)

| Task                               | Lines Saved | Risk |
| ---------------------------------- | ----------- | ---- |
| Extract TokenEstimator utility     | 50          | Low  |
| Create UnifiedRoutingDecision type | 100         | Low  |
| Create QuorumValidator             | 150         | Low  |
| Unify Importance/Priority enums    | 50          | Low  |
| **Subtotal**                       | **350**     |      |

### Phase 2: Medium Risk (Week 3-4)

| Task                         | Lines Saved | Risk   |
| ---------------------------- | ----------- | ------ |
| Consolidate task analysis    | 200         | Medium |
| Create CascadeRouterBase     | 300         | Medium |
| Unify execution context      | 300         | Medium |
| Consolidate expert selection | 200         | Medium |
| **Subtotal**                 | **1,000**   |        |

### Phase 3: High Risk (Week 5-8)

| Task                            | Lines Saved | Risk |
| ------------------------------- | ----------- | ---- |
| Unified pruning interface       | 400         | High |
| Deprecate SessionMemory         | 500         | High |
| IOrchestrator abstraction       | 600         | High |
| Unified step execution pipeline | 350         | High |
| **Subtotal**                    | **1,850**   |      |

---

## 7. Risk Matrix

| Consolidation     | Breaking Changes | Testing Effort  | Rollback Difficulty |
| ----------------- | ---------------- | --------------- | ------------------- |
| Token estimation  | None             | Unit tests      | Easy                |
| Routing decisions | Type changes     | All routers     | Medium              |
| Quorum logic      | Interface change | Consensus tests | Medium              |
| Pruning           | Behavior change  | Memory tests    | Hard                |
| Persistence       | Data migration   | E2E tests       | Very Hard           |
| Orchestration     | Architecture     | Full E2E        | Very Hard           |

---

## 8. ADR Requirements

Each consolidation requires an ADR documenting:

1. Context (why change)
2. Options considered
3. Decision
4. Consequences
5. Migration steps

See `docs/adr/` for templates.

---

_Generated by System Mandate Loop H_
_Next: Loop I - CLI Orchestration Fitness Score_
