# Software Factory Hardening Report

**Epic:** #952
**Date:** 2026-02-10 (ET)
**Status:** Phase 1-2 delivered, Phase 3-7 tracked

---

## 1. Executive Summary

A full-system review of the Nexus Agents orchestration platform identified **7 critical gaps** between the current implementation and production-grade software factory requirements. Three proposals were approved via 6-agent consensus voting (83% supermajority each). Phase 1-2 (execution trace contract + disk persistence) are implemented and deployed. Remaining phases are tracked as GitHub issues #955-#959.

**Key finding:** Nexus Agents has strong routing, consensus, and pipeline infrastructure (22k+ tests, 98/100 fitness). But it lacks the **observability trifecta** needed to graduate from "cool demo" to actual software factory:

1. **Execution traces** with agent + model attribution (NOW DELIVERED)
2. **Canonical scenarios** that exercise real orchestration flows (PLANNED)
3. **Deterministic replay** from filesystem checkpoints (PLANNED)

---

## 2. Current Architecture (As Discovered)

### Routing Pipeline

```
Task -> BudgetRouter -> ZeroRouter -> PreferenceRouter -> TopsisRouter -> LinUCB -> Selected Model
```

- 5-stage composite routing with contextual bandit (LinUCB) final selection
- 8 supported models across 3 CLIs (claude, gemini, codex)
- OutcomeStore records task outcomes for reward computation

### Orchestration Graph

```
GraphBuilder -> CompiledGraph -> GraphExecutor (super-step BSP)
                                     |
                              CheckpointStore (in-memory, 50/execution)
```

- 7 workflow templates (echo, pipeline, code-review, security-scan, + 3 multi-CLI)
- Conditional edges with runtime routing
- maxTraversals limits prevent infinite loops

### V2 Pipeline

```
TaskContract -> PlanContract -> PipelineRunner -> PluginRegistry -> EventBus
                                                       |
                                              3 core plugins:
                                              - task-analyzer
                                              - model-router
                                              - cli-executor
```

- PolicyEngine with 5 built-in rules (trust-tier, security-review, bounded-iteration, cost-budget, high-risk-approval)
- EventBus with 17 event types, 10k circular buffer
- ArtifactStore (in-memory, 1000 artifact limit, FIFO eviction)

### Consensus Voting

- 6 agent roles: architect, security, devex, ai_ml, pm, catfish (contrarian)
- 5 strategies: simple_majority, supermajority, unanimous, proof_of_learning, higher_order
- Multi-CLI round-robin assignment for model diversity

---

## 3. StrongDM Factory Pattern to Nexus Mapping

| StrongDM Concept             | Nexus Equivalent                           | Status                    |
| ---------------------------- | ------------------------------------------ | ------------------------- |
| **Seed** (initial spec)      | TaskContract + PlanContract                | Implemented               |
| **Validation Harness**       | ScenarioRunner (stub mode only)            | Gap: no live execution    |
| **Feedback Loop**            | OutcomeStore -> LinUCB quality rewards     | Implemented               |
| **Scenarios + Satisfaction** | scenario-validator.ts (keyword matching)   | Gap: no E2E scenarios     |
| **DTU (Digital Twin)**       | GraphBuilder + CheckpointStore             | Partial: no disk persist  |
| **Filesystem as Memory**     | ArtifactStore (in-memory only)             | Gap: no disk persistence  |
| **Shift Work**               | Not implemented                            | Gap                       |
| **Gene Transfusion**         | AgentPlanner (AOrchestra) expert selection | Partial                   |
| **Weather Report**           | weather_report MCP tool (observational)    | Gap: not prescriptive     |
| **CXDB Turn DAG**            | EventBus event stream                      | Gap: no trace persistence |
| **Agent Identity**           | Expert roles (9 types)                     | Implemented               |
| **Scoped Delegation**        | V2 pipeline plugins                        | Implemented               |

---

## 4. Canonical Scenarios (Designed, Not Yet Implemented)

### Scenario 1: E2E Orchestration Sanity

```
Input: "Implement a rate limiter module"
Expected flow:
  1. TaskContract created from spec
  2. AgentPlanner selects: [code_expert, testing_expert, security_expert]
  3. GraphBuilder compiles execution plan
  4. GraphExecutor runs super-steps (code -> test -> review)
  5. Failure injected at step 3 (timeout)
  6. Retry succeeds
  7. Artifacts written to ./runs/{run_id}/
```

### Scenario 2: Branch Coverage Drill

```
Input: Security-flagged task with complexity > 50
Expected flow:
  1. code-review template selected
  2. Conditional edge: complexity > 50 -> deep_review branch
  3. Policy gate: security-review rule triggered
  4. Branch taken: deep_review with security_expert
  5. Output: branch coverage report (2/3 branches exercised)
```

### Scenario 3: Filesystem Rehydration

```
Run 1: Execute pipeline, checkpoint after step 2
Run 2: Resume from checkpoint, complete remaining steps
Validation: Run 2 trace continues from Run 1's checkpoint
```

### Scenario 4: MCP Front-End Flow

```
MCP client calls orchestrate({task: "Review this PR"})
Pipeline executes: analyze -> route -> execute
query_trace({run_id}) returns full attribution
```

---

## 5. Harness Design

### Architecture

```
ScenarioRunner
  |
  +--> StubFactory (existing, for CI mode)
  |
  +--> LiveGraphExecutor (NEW, for integration mode)
         |
         +--> GraphBuilder + GraphExecutor
         |
         +--> TraceWriter -> ./runs/{run_id}/trace.jsonl
         |
         +--> CheckpointStore (disk-backed for rehydration)
```

### Execution Modes

| Mode   | Adapters     | Deterministic | Speed   | Use Case          |
| ------ | ------------ | ------------- | ------- | ----------------- |
| `stub` | StubFactory  | Yes           | <1s     | CI, TDD           |
| `live` | MockAdapters | Yes (seeded)  | <10s    | Integration       |
| `real` | Real CLIs    | No            | Minutes | Manual validation |

---

## 6. Observability and Trace Contract

### Schema (IMPLEMENTED)

```typescript
ExecutionTraceEntry {
  timestamp: number       // Unix ms
  runId: string           // TaskContract.id
  eventType: string       // Pipeline event type
  executionId?: string    // Pipeline correlation
  nodeId?: string         // Graph node / stage
  agentId?: string        // Expert agent ID
  modelId?: string        // Model used
  role?: string           // Agent role
  durationMs?: number     // Step duration
  reasoning?: string      // Model selection reasoning
  decisionPath?: string[] // Routing stage:result pairs
  errorTaxonomy?: 'retriable' | 'fatal'
  error?: string          // Error message
}
```

### Disk Layout (IMPLEMENTED)

```
./runs/{run_id}/
  trace.jsonl     # One ExecutionTraceEntry per line
  index.md        # Human-readable summary
  artifacts/      # (future) step outputs
  scenarios/      # (future) scenario fixtures
```

### Enhanced Events (IMPLEMENTED)

| Event              | New Fields                  | Purpose                      |
| ------------------ | --------------------------- | ---------------------------- |
| `model.called`     | `agentId`, `role`           | Agent attribution            |
| `routing.decision` | `reasoning`, `decisionPath` | Model selection transparency |
| `stage.failed`     | `errorTaxonomy`             | Error classification         |

---

## 7. Weather Report Model Mapping Plan

### Current State

The `weather_report` MCP tool reports observational data:

- Per-CLI success rates and avg duration
- Per-category breakdowns
- Adaptive routing bonuses

### Planned Enhancement (Issue #958)

Add `recommended_mappings` section derived from OutcomeStore:

```yaml
recommended_mappings:
  code_expert:
    preferred: claude-sonnet-4-5
    confidence: 0.87
    basis: '92% success rate on code tasks (n=45)'
  security_expert:
    preferred: claude-opus-4-6
    confidence: 0.91
    basis: '95% success rate on security tasks (n=23)'
```

LinUCB prior seeding: `seedPriors()` initializes arm weights with ~5 observation equivalents, overridable by exploration.

---

## 8. Backlog: Epics and Issues

### Epic #952: Software Factory Hardening

| Phase | Issue | Status | Description                                          |
| ----- | ----- | ------ | ---------------------------------------------------- |
| 1     | #953  | CLOSED | Execution trace schema with agent_id/model_id        |
| 2     | #954  | CLOSED | TraceWriter disk persistence to ./runs/              |
| 3     | #955  | OPEN   | Canonical scenario harness with live graph execution |
| 4     | #956  | OPEN   | Scenario fixtures and CLI command                    |
| 5     | #957  | OPEN   | query_trace MCP tool                                 |
| 6     | #958  | OPEN   | LinUCB prior seeding and weather report mappings     |
| 7     | #959  | OPEN   | Deliverables report and branch coverage evidence     |

### Dependency Chain

```
#953 (trace schema)
  |
  +--> #954 (TraceWriter)
  |      |
  |      +--> #955 (scenario harness)
  |             |
  |             +--> #956 (fixtures + CLI)
  |
  +--> #957 (query_trace MCP tool)

#958 (LinUCB priors) -- independent

#959 (report) -- depends on all above
```

---

## 9. Risks, Anti-Patterns, and Likely Regressions

### Risks

| Risk                      | Impact | Mitigation                                  |
| ------------------------- | ------ | ------------------------------------------- |
| Trace I/O blocks pipeline | P1     | Buffered async writes (implemented)         |
| ./runs/ unbounded growth  | P2     | NEXUS_TRACE_RETENTION_DAYS config (planned) |
| Sensitive data in traces  | P2     | Hash inputs, never log raw secrets          |
| Mock adapter drift        | P3     | Contract tests enforce mock fidelity        |
| Scenario flakiness in CI  | P3     | Determinism via seeded random + frozen time |

### Anti-Patterns Detected

1. **ArtifactStore is memory-only** -- artifacts evicted by FIFO after 1000 entries. No disk backup.
2. **EventBus has no agent_id in schema** -- events correlate by executionId/taskId but lose agent provenance. (FIXED in Phase 1)
3. **ConsensusEngine doesn't log model_id per vote** -- votes keyed by agentId only, losing model provenance.
4. **Logger has no correlation ID** -- stateless per call, no trace propagation. RequestContext exists but isn't wired to logger.
5. **V2 pipeline metrics not emitted as events** -- PipelineMetrics returned in-memory, not published to EventBus.

### Likely Regressions

- Event schema extensions are backward-compatible (new optional fields), low regression risk
- TraceWriter filesystem writes could fail silently in read-only environments (mitigated by try/catch)
- Export contract tests pass (52/52) confirming no barrel export breaks

---

## 10. Next Actions (Top 5)

1. **Implement Phase 3 (#955)** -- Extend ScenarioRunner with live graph execution mode
2. **Implement Phase 4 (#956)** -- Create 4 canonical YAML scenario fixtures + `nexus scenario run` CLI command
3. **Implement Phase 5 (#957)** -- Add `query_trace` MCP tool (21st tool) for runtime trace visibility
4. **Implement Phase 6 (#958)** -- LinUCB `seedPriors()` for cold-start improvement
5. **Wire TraceWriter into V2 pipelines** -- Auto-create TraceWriter in `executeDelegatePipeline()` and `executeOrchestratePipeline()` so every real execution produces traces

---

## Appendix A: Example Trace (from test suite)

```jsonl
{"timestamp":1739234407000,"runId":"test-run-1","eventType":"model.called","executionId":"exec-1","modelId":"claude-sonnet-4-5","agentId":"code_expert","role":"code_expert","durationMs":500}
{"timestamp":1739234407100,"runId":"test-run-1","eventType":"routing.decision","modelId":"claude-sonnet-4-5","reasoning":"Highest TOPSIS score (0.92) for code generation","decisionPath":["budget:pass","topsis:0.92"]}
{"timestamp":1739234407200,"runId":"test-run-1","eventType":"stage.failed","executionId":"exec-1","nodeId":"model-router","error":"Connection timeout","errorTaxonomy":"retriable"}
```

## Appendix B: Branch Coverage Evidence

Graph template `code-review` has 1 conditional edge:

```
analyze_task --[complexity > threshold]--> deep_review
             --[else]-------------------> quick_review
```

Current test coverage (from graph workflow tests):

- `quick_review` branch: exercised in `code-review template` test
- `deep_review` branch: exercised in `code-review template with high complexity` test
- Edge case: `complexity === threshold` exercised in boundary test

Branch coverage: **3/3 paths** covered in existing test suite.

Security-scan template has 1 conditional edge:

- `severity > threshold` -> `deep_scan` (covered)
- `else` -> `quick_scan` (covered)

Branch coverage: **2/2 paths** covered.

---

_Generated by Nexus Agents Orchestrator (Epic #952)_
_Consensus voting: 3 proposals, 18 agent votes (6 per proposal), all approved at 83%+ supermajority_
