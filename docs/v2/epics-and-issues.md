# V2 Epics & Issues

_Work breakdown with acceptance criteria, dependencies, risk, and sizing._

---

## Epic Overview

| #   | Epic                                   | Size | Risk   | Dependencies |
| --- | -------------------------------------- | ---- | ------ | ------------ |
| E1  | TaskContract + PlanContract Types      | S    | Low    | None         |
| E2  | Pipeline Runner                        | M    | Medium | E1           |
| E3  | Plugin Registry + Structural Isolation | L    | High   | E2           |
| E4  | Event Bus + Artifact Store             | M    | Medium | E2           |
| E5  | Policy Engine + Governance Gates       | M    | Medium | E2, E4       |
| E6  | MCP Tool Migration                     | M    | Low    | E1-E5        |
| E7  | Feedback Loop Closure                  | S    | Medium | E4           |
| E8  | Agent Module Decomposition             | L    | High   | E3           |
| E9  | Documentation + Cleanup                | S    | Low    | All          |

**Minimum Viable V2:** E1 + E2 (+ first tool in E6)

---

## E1: TaskContract + PlanContract Types

### E1-1: Define TaskContract type and Zod schema

**Size:** S | **Risk:** Low | **Dependencies:** None

**Description:** Define `TaskContract` as the unified task lifecycle type. Include all fields from `TaskSignals`, `TaskAnalysisResult`, and `RoutingDecision`. Add lifecycle status (intake→done/failed). Define Zod schema for runtime validation.

**Acceptance criteria:**

- [ ] `TaskContract` interface defined in `src/pipeline/types.ts`
- [ ] `TaskStatus` union type covers all lifecycle states
- [ ] `TaskContractSchema` Zod schema validates all fields
- [ ] Unit tests for Zod validation (valid + invalid inputs)
- [ ] Type exported from pipeline barrel

### E1-2: Define PlanContract type and Zod schema

**Size:** S | **Risk:** Low | **Dependencies:** None

**Description:** Define `PlanContract` with stages, dependencies, policy gates, cost estimate, and approval flag. Define `StageSpec` with plugin reference, input/output artifacts, and dependencies.

**Acceptance criteria:**

- [ ] `PlanContract` interface defined
- [ ] `StageSpec` interface with `StageType` union
- [ ] `PolicyGateSpec` interface
- [ ] Zod schemas for all types
- [ ] Unit tests

### E1-3: V1↔V2 adapter functions

**Size:** S | **Risk:** Low | **Dependencies:** E1-1, E1-2

**Description:** Implement `taskSignalsToContract()`, `routingDecisionToPlan()`, and `pipelineResultToToolResponse()`. These enable gradual migration.

**Acceptance criteria:**

- [ ] Round-trip test: V1 → V2 → V1 output is equivalent
- [ ] All V1 fields preserved (no data loss)
- [ ] Adapter handles missing optional fields gracefully

---

## E2: Pipeline Runner

### E2-1: Plan-to-graph compiler

**Size:** M | **Risk:** Medium | **Dependencies:** E1

**Description:** Implement `planToGraph()` that converts a `PlanContract` into a `CompiledGraph` using the existing `GraphBuilder`. Each stage becomes a graph node. Dependencies become edges. Policy gates become gate nodes inserted between stages.

**Acceptance criteria:**

- [ ] Linear plans compile to linear graphs
- [ ] Plans with independent stages produce parallel-capable graphs
- [ ] Policy gates inserted as nodes between specified stages
- [ ] Compile step validates no cycles, all nodes reachable
- [ ] Error on invalid dependency references

### E2-2: Plugin handler wrapper

**Size:** S | **Risk:** Low | **Dependencies:** E1

**Description:** Implement a function that wraps `PipelinePlugin.execute()` as a `NodeHandler` compatible with GraphBuilder. The wrapper loads artifacts, passes context, captures output, and updates state.

**Acceptance criteria:**

- [ ] Plugin.execute() called with correct StageContext
- [ ] Input artifacts loaded from state
- [ ] Output artifacts written to state via reducers
- [ ] Errors caught and mapped to node failure

### E2-3: PipelineRunner implementation

**Size:** M | **Risk:** Medium | **Dependencies:** E2-1, E2-2

**Description:** Implement `IPipelineRunner` with `compile()`, `execute()`, and `resume()` methods. Uses GraphBuilder.compile() for validation and executeGraph() for execution.

**Acceptance criteria:**

- [ ] compile() returns Result<CompiledPipeline, CompileError>
- [ ] execute() runs all stages to completion or failure
- [ ] resume() skips completed stages using checkpoint
- [ ] maxSteps bound enforced
- [ ] Global timeout enforced
- [ ] AbortSignal cancellation supported

### E2-4: Per-edge maxTraversals

**Size:** S | **Risk:** Low | **Dependencies:** None (can be done in parallel)

**Description:** Add `maxTraversals?: number` to `ConditionalEdge` in GraphBuilder. Track per-edge traversal count during execution. Fail edge when limit exceeded.

**Acceptance criteria:**

- [ ] ConditionalEdge type extended (backward compatible)
- [ ] Traversal count tracked during execution
- [ ] Limit exceeded → router receives `__LIMIT_EXCEEDED__`
- [ ] Default maxTraversals: 3
- [ ] Existing tests pass unchanged

### E2-5: Breakpoint support

**Size:** M | **Risk:** Medium | **Dependencies:** E2-3

**Description:** Implement `BreakpointSpec` — pause, log, or approve before specific nodes. Integrate with checkpointing for resume after pause.

**Acceptance criteria:**

- [ ] 'pause' breakpoint saves checkpoint + emits event
- [ ] 'log' breakpoint emits event without pausing
- [ ] 'approve' breakpoint pauses + emits approval request
- [ ] Resume from breakpoint continues execution
- [ ] Conditional breakpoints (only pause if condition true)

---

## E3: Plugin Registry + Structural Isolation

### E3-1: Plugin manifest and interface types

**Size:** S | **Risk:** Low | **Dependencies:** None

**Description:** Define `PluginManifest`, `PipelinePlugin`, `PluginTrustLevel`, and `StageContext` types. Include Zod schemas.

**Acceptance criteria:**

- [ ] Types defined with full JSDoc
- [ ] Zod schemas for manifest validation
- [ ] Trust levels: core, standard, experimental, external

### E3-2: Plugin registry implementation

**Size:** M | **Risk:** Medium | **Dependencies:** E3-1

**Description:** Implement `IPluginRegistry` with register, resolve, listEnabled, isEnabled. Validate manifests at registration. Enforce experimental plugin gating via config.

**Acceptance criteria:**

- [ ] Registration validates manifest schema
- [ ] Duplicate ID rejected
- [ ] Experimental plugins rejected when config disabled
- [ ] Missing capabilities → registration failure
- [ ] Registry frozen after startup (no runtime changes)

### E3-3: Core plugin wrappers (8 plugins)

**Size:** M | **Risk:** Medium | **Dependencies:** E3-2

**Description:** Wrap existing production components as core plugins: task-analyzer, model-router, cli-executor, consensus-voter, graph-runner, spec-parser, security-checker, plan-compiler.

**Acceptance criteria:**

- [ ] Each plugin has valid manifest
- [ ] Each plugin's execute() delegates to existing implementation
- [ ] All 8 core plugins register successfully
- [ ] Existing tests pass unchanged

### E3-4: Standard plugin wrappers (7 plugins)

**Size:** M | **Risk:** Low | **Dependencies:** E3-2

**Description:** Wrap expert agent types as standard plugins: code, security, architecture, testing, documentation, pm, ux.

**Acceptance criteria:**

- [ ] Each expert type wrapped as plugin
- [ ] Plugin.execute() creates and runs expert
- [ ] All 7 standard plugins register

### E3-5: Experimental plugin migration

**Size:** L | **Risk:** High | **Dependencies:** E3-2

**Description:** Move collaboration (91 files), reasoning (16), sica (13), ictm (7), coordination (10), puppeteer (43) into `src/pipeline/plugins/experimental/`. Update imports. Add ESLint restriction.

**Acceptance criteria:**

- [ ] All experimental files moved to new directory
- [ ] Each has a valid PluginManifest with experimental: true
- [ ] ESLint rule prevents cross-plugin imports
- [ ] All existing tests pass from new locations
- [ ] Experimental plugins disabled by default in config
- [ ] Production MCP tools work without experimental plugins loaded

### E3-6: ESLint plugin isolation rule

**Size:** S | **Risk:** Low | **Dependencies:** None

**Description:** Configure `no-restricted-imports` to prevent plugins from importing other plugins.

**Acceptance criteria:**

- [ ] ESLint errors on cross-plugin imports
- [ ] Core modules (core/, config/) remain importable by all

---

## E4: Event Bus + Artifact Store

### E4-1: Event type definitions

**Size:** S | **Risk:** Low | **Dependencies:** None

**Description:** Define `PipelineEvent` discriminated union with all event types (task, pipeline, stage, policy, artifact, model, routing).

**Acceptance criteria:**

- [ ] All event types defined with TypeScript
- [ ] Every event has taskId, executionId (where applicable), timestamp
- [ ] Zod schema for runtime validation

### E4-2: In-memory EventBus

**Size:** S | **Risk:** Low | **Dependencies:** E4-1

**Description:** Implement `IEventBus` with emit, subscribe, query. Bounded circular buffer (max 10k events).

**Acceptance criteria:**

- [ ] emit() fires all matching subscribers
- [ ] subscribe() returns unsubscribe function
- [ ] query() filters by type, taskId, since
- [ ] Buffer evicts oldest events when full
- [ ] Handler errors caught and logged (no propagation)

### E4-3: Artifact store

**Size:** M | **Risk:** Low | **Dependencies:** None

**Description:** Implement `IArtifactStore` with put, get, query, provenance. Bounded (max 1000 artifacts, 1MB content limit).

**Acceptance criteria:**

- [ ] put() returns ArtifactRef
- [ ] get() returns artifact or undefined
- [ ] query() filters by type, creator, metadata
- [ ] provenance() returns creation chain
- [ ] LRU eviction when bound exceeded

### E4-4: Wire into PipelineRunner

**Size:** M | **Risk:** Medium | **Dependencies:** E2-3, E4-2, E4-3

**Description:** Pipeline runner emits events at every stage boundary and passes artifact store to plugins via StageContext.

**Acceptance criteria:**

- [ ] stage.started emitted before each stage
- [ ] stage.completed emitted after each stage
- [ ] pipeline.checkpoint emitted after each super-step
- [ ] Artifacts created by plugins stored in artifact store
- [ ] Provenance chain maintained across stages

---

## E5: Policy Engine + Governance Gates

### E5-1: Policy engine implementation

**Size:** M | **Risk:** Medium | **Dependencies:** None

**Description:** Implement `IPolicyEngine` with evaluate() and registerRule(). Include 5 built-in rules: trust-tier, security-review, bounded-iteration, cost-budget, high-risk-approval.

**Acceptance criteria:**

- [ ] Each rule evaluated correctly (unit tests)
- [ ] Rules evaluated in priority order
- [ ] PolicyDecision returned (allow/block/escalate)
- [ ] Config enables/disables individual rules

### E5-2: Gate handler for graph execution

**Size:** S | **Risk:** Low | **Dependencies:** E5-1, E2-1

**Description:** Implement policy gate as a graph node handler. When a gate blocks, pipeline pauses (breakpoint) and emits escalation event.

**Acceptance criteria:**

- [ ] Gate node evaluates policy rules
- [ ] Block → pipeline pauses
- [ ] Warn → log + continue
- [ ] Escalate → emit event + pause

### E5-3: Gateway enforcement migration

**Size:** M | **Risk:** Medium | **Dependencies:** E5-1

**Description:** Gateway middleware delegates to policy engine. Transition from observe-only to configurable enforce mode.

**Acceptance criteria:**

- [ ] Gateway calls policy engine for tier 3 requests
- [ ] Default mode: warn (log only, no blocking)
- [ ] Config option: enforce (block on policy failure)
- [ ] Existing gateway tests pass

---

## E6: MCP Tool Migration

### E6-1: Migrate delegate_to_model

**Size:** S | **Risk:** Low | **Dependencies:** E2

**Description:** Implement V2 path for delegate_to_model using single-stage pipeline. Config flag switches between V1 and V2.

**Acceptance criteria:**

- [ ] V2 path produces equivalent results to V1
- [ ] Config flag: `v2.delegate_to_model: true/false`
- [ ] MCP schema unchanged

### E6-2: Migrate execute_expert

**Size:** S | **Risk:** Low | **Dependencies:** E2, E3

**Acceptance criteria:** Same pattern as E6-1.

### E6-3: Migrate orchestrate

**Size:** M | **Risk:** Medium | **Dependencies:** E2, E3, E5

**Acceptance criteria:** Same pattern. Multi-stage pipeline.

### E6-4: Migrate execute_spec

**Size:** M | **Risk:** Medium | **Dependencies:** E2, E3, E5

**Acceptance criteria:** Same pattern. Multi-stage pipeline with validation.

---

## E7: Feedback Loop Closure

### E7-1: Wire OutcomeStore to EventBus

**Size:** S | **Risk:** Low | **Dependencies:** E4

**Description:** OutcomeStore subscribes to `stage.completed` and `model.called` events. Records outcomes automatically.

**Acceptance criteria:**

- [ ] OutcomeStore receives events without manual recording
- [ ] Outcome data includes model, success, duration, task type
- [ ] Bounded storage maintained

### E7-2: Wire CompositeRouter to OutcomeStore

**Size:** M | **Risk:** Medium | **Dependencies:** E7-1

**Description:** LinUCB bandit reads outcome data when making routing decisions. Historical performance influences model selection.

**Acceptance criteria:**

- [ ] LinUCB reads recent outcomes
- [ ] Model scoring adjusts based on historical success rate
- [ ] A/B test: V2 routing vs V1 routing shows measurable difference
- [ ] Fallback to static scores when no outcome data available

---

## E8: Agent Module Decomposition

### E8-1: Split agents/ into focused modules

**Size:** L | **Risk:** High | **Dependencies:** E3

**Description:** Decompose the 287-file agents module:

- `src/agent-framework/` — BaseAgent, StateMachine, ContextManager (~30 files)
- `src/experts/` — Expert implementations (~80 files)
- `src/pipeline/plugins/experimental/` — All experimental features (~180 files)

**Acceptance criteria:**

- [ ] agents/ module reduced to <80 files
- [ ] No circular dependencies between new modules
- [ ] All existing tests pass from new locations
- [ ] Export barrels updated

---

## E9: Documentation + Cleanup

### E9-1: Remove mesh mode documentation

**Size:** S | **Risk:** Low | **Dependencies:** None

**Acceptance criteria:**

- [ ] Help text no longer claims mesh mode works
- [ ] CLAUDE.md updated to remove mesh references
- [ ] CLI rejects mesh mode with clear "planned feature" message

### E9-2: Fix skills count discrepancy

**Size:** S | **Risk:** Low | **Dependencies:** None

**Acceptance criteria:** CLAUDE.md says "Skills (13)" not "Skills (12)".

### E9-3: Update docs/README.md index

**Size:** S | **Risk:** Low | **Dependencies:** All other epics

**Acceptance criteria:** All V2 design docs indexed.

---

## Minimum Viable V2 (Thin Slice)

**E1 + E2-1 + E2-2 + E2-3 + E6-1**

Delivers:

- TaskContract + PlanContract types
- Plan-to-graph compiler
- Pipeline runner
- One migrated MCP tool (delegate_to_model)

Does NOT require: E3 (plugins), E4 (events), E5 (policy), E7 (feedback), E8 (decomposition).

**Estimated effort:** ~2 weeks.
