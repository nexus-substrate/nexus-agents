# 10 — Migration Plan: V1 to V2

_Incremental. Non-breaking. Wrapping before replacing._

---

## Guiding Principles

1. **Additive phases.** Each phase adds new code alongside V1. Nothing is deleted until the replacement is proven.
2. **MCP tools never break.** All 20 tool schemas stay the same. Internal wiring changes.
3. **One tool at a time.** Tools migrate to V2 pipeline individually, not all at once.
4. **Feature flags for cutover.** Each migrated tool has a config flag to use V1 or V2 path.
5. **Tests prove equivalence.** For each migrated tool, tests verify V2 produces equivalent results to V1.

---

## Phase 1: TaskContract + PlanContract Types (Size: S)

**What:** Define `TaskContract`, `PlanContract`, `StageSpec`, and adapter functions that convert between V1 and V2 types.

**Files created:**

- `src/pipeline/types.ts` — TaskContract, PlanContract, StageSpec, StageResult
- `src/pipeline/adapters.ts` — `taskSignalsToContract()`, `routingDecisionToPlan()`, `pipelineResultToToolResponse()`

**Files modified:** None. Pure additive.

**Tests:**

- Round-trip: V1 signals → TaskContract → back to V1-compatible output
- All TaskStatus transitions valid
- PlanContract validation (Zod schema)

**Acceptance criteria:**

- [ ] TaskContract type covers all fields from TaskSignals, TaskAnalysisResult, RoutingDecision
- [ ] PlanContract type covers all fields from StageSpec with dependencies
- [ ] Adapter functions are lossless (V1 → V2 → V1 round-trip)
- [ ] Zod schemas validate both types

**Dependencies:** None.
**Risk:** Low.

---

## Phase 2: Pipeline Runner (Size: M)

**What:** Implement `PipelineRunner` that compiles a `PlanContract` into a `CompiledGraph` using the existing `GraphBuilder`, then executes it with `executeGraph`.

**Files created:**

- `src/pipeline/pipeline-runner.ts` — `IPipelineRunner`, `createPipelineRunner()`
- `src/pipeline/plan-compiler.ts` — `planToGraph()` function
- `src/pipeline/plugin-handler.ts` — Wraps `PipelinePlugin.execute()` as `NodeHandler`
- `src/pipeline/index.ts` — Barrel exports

**Files modified:**

- `src/orchestration/graph/graph-builder.ts` — Add `maxTraversals` to ConditionalEdge (backward compatible)

**Tests:**

- Linear plan (A→B→C) compiles and executes
- Parallel plan (A→{B,C}→D) uses super-steps
- Failed stage triggers error handling
- Bounded iteration respected
- Checkpoint/resume works

**Acceptance criteria:**

- [ ] PlanContract compiles to valid CompiledGraph
- [ ] Super-step execution runs parallel stages correctly
- [ ] maxSteps and per-edge maxTraversals are enforced
- [ ] Checkpoint store captures state at each super-step
- [ ] Resume from checkpoint skips completed stages

**Dependencies:** Phase 1.
**Risk:** Medium — integration with existing GraphBuilder may surface edge cases.

---

## Phase 3: Plugin Registry + Structural Isolation (Size: L)

**What:** Implement `PluginRegistry` with manifest-based registration. Migrate existing components to plugins. Move experimental features behind plugin flags.

**Files created:**

- `src/pipeline/plugins/registry.ts` — `IPluginRegistry`, `createPluginRegistry()`
- `src/pipeline/plugins/manifest.ts` — `PluginManifest` type + validation
- `src/pipeline/plugins/core/` — Core plugin wrappers:
  - `task-analyzer-plugin.ts`
  - `model-router-plugin.ts`
  - `cli-executor-plugin.ts`
  - `consensus-voter-plugin.ts`
  - `plan-compiler-plugin.ts`
- `src/pipeline/plugins/standard/` — Standard plugin wrappers:
  - `code-expert-plugin.ts`, `security-expert-plugin.ts`, etc.
- `src/pipeline/plugins/experimental/` — Experimental plugin wrappers:
  - `forest-of-thought-plugin.ts`, `sica-plugin.ts`, `ictm-plugin.ts`, etc.

**Files modified:**

- `src/config/schemas.ts` — Add `plugins` config section
- `src/cli-server.ts` — Load plugin registry at startup

**Directory restructuring:**

```
src/agents/
  collaboration/  → src/pipeline/plugins/experimental/collaboration/
  reasoning/      → src/pipeline/plugins/experimental/reasoning/
  self-improving/  → src/pipeline/plugins/experimental/sica/
  ictm/           → src/pipeline/plugins/experimental/ictm/
  coordination/   → src/pipeline/plugins/experimental/coordination/
  orchestration/  → src/pipeline/plugins/experimental/puppeteer/
```

**ESLint enforcement:**

- `no-restricted-imports` rule: plugins cannot import from other plugin directories

**Tests:**

- Plugin registration with valid/invalid manifests
- Experimental plugins disabled by default
- Plugin isolation: cannot import across plugin boundaries
- Config enables/disables specific experimental plugins

**Acceptance criteria:**

- [ ] All 8 core plugins registered and functional
- [ ] All 7 standard plugins registered and functional
- [ ] All 10+ experimental plugins behind flags (default off)
- [ ] ESLint rule prevents cross-plugin imports
- [ ] Config controls experimental plugin loading
- [ ] No MCP tool behavior changes

**Dependencies:** Phase 2.
**Risk:** High — Large file move. Extensive import rewiring. Potential for broken paths.
**Mitigation:** Move one plugin at a time. Run full test suite after each move.

---

## Phase 4: Event Bus + Artifact Store + Feedback Loop (Size: M)

**What:** Implement in-memory EventBus and ArtifactStore. Wire into PipelineRunner. Close the feedback loop between outcomes and routing.

**Files created:**

- `src/pipeline/events/event-bus.ts` — `IEventBus`, `createEventBus()`
- `src/pipeline/events/event-types.ts` — `PipelineEvent` discriminated union
- `src/pipeline/artifacts/artifact-store.ts` — `IArtifactStore`, `createArtifactStore()`
- `src/pipeline/artifacts/artifact-types.ts` — `Artifact`, `ArtifactRef`, `ArtifactType`
- `src/pipeline/context/context-store.ts` — `ContextStore` (Option A from doc 09)

**Files modified:**

- `src/pipeline/pipeline-runner.ts` — Emit events at stage boundaries
- `src/pipeline/plugin-handler.ts` — Pass artifact store + event bus to plugins
- `src/orchestration/outcomes/outcome-store.ts` — Subscribe to `stage.completed` events
- `src/cli-adapters/composite-router.ts` — Read outcomes for routing feedback

**Tests:**

- Event emission at each stage boundary
- Event filtering by type, taskId, stageId
- Artifact CRUD operations
- Provenance chain tracking
- Feedback loop: outcome → routing adjustment

**Acceptance criteria:**

- [ ] Every stage transition emits typed event
- [ ] Event query returns correct filtered results
- [ ] Artifacts tracked with provenance
- [ ] OutcomeStore receives stage.completed events
- [ ] CompositeRouter reads outcome data for routing (feedback loop closed)
- [ ] Bounded event buffer (max 10k events)

**Dependencies:** Phase 2.
**Risk:** Medium — Feedback loop integration may require CompositeRouter changes.

---

## Phase 5: Policy Engine + Gateway Enforcement (Size: M)

**What:** Implement PolicyEngine with built-in rules. Wire into PipelineRunner as gate nodes. Transition gateway from observe-only to enforce.

**Files created:**

- `src/pipeline/policy/policy-engine.ts` — `IPolicyEngine`, `createPolicyEngine()`
- `src/pipeline/policy/rules/` — Built-in rules (trust-tier, security-review, bounded-iteration, cost-budget, high-risk-approval)
- `src/pipeline/policy/gate-handler.ts` — Graph node handler for policy gates

**Files modified:**

- `src/pipeline/plan-compiler.ts` — Insert policy gate nodes between stages
- `src/mcp/gateway/gateway-middleware.ts` — Delegate to policy engine
- `src/config/schemas.ts` — Add `governance.policyGates` config section

**Tests:**

- Each built-in rule evaluated correctly
- Policy gate blocks pipeline on failure
- Escalation emits correct events
- Config enables/disables individual rules
- Gateway middleware delegates to policy engine

**Acceptance criteria:**

- [ ] 5 built-in policy rules implemented
- [ ] Policy gates inserted between stages in compiled graph
- [ ] Pipeline pauses on 'block' decision
- [ ] Escalation events emitted correctly
- [ ] Gateway transitions from observe-only to enforce (config-controlled)

**Dependencies:** Phase 2, Phase 4.
**Risk:** Medium — Policy enforcement may block existing workflows unexpectedly.
**Mitigation:** Default to `warn` mode initially. Switch to `block` after validation.

---

## Phase 6: MCP Tool Migration (Size: M)

**What:** Migrate MCP tools one at a time from V1 direct implementation to V2 pipeline execution.

**Migration order (by complexity):**

1. `delegate_to_model` — Single-stage pipeline (route → execute)
2. `execute_expert` — Single-stage pipeline (execute)
3. `run_graph_workflow` — Already uses GraphBuilder, thin wrapper
4. `orchestrate` — Multi-stage pipeline
5. `execute_spec` — Multi-stage pipeline (most complex)
6. `consensus_vote` — Multi-stage parallel + aggregate

**Per-tool migration pattern:**

```typescript
// V1 path (kept during migration)
async function handleOrchestrate_V1(args) {
  /* existing code */
}

// V2 path
async function handleOrchestrate_V2(args) {
  const contract = taskSignalsToContract(args);
  const plan = await compilePlan(contract);
  const pipeline = pipelineRunner.compile(plan);
  return pipelineRunner.execute(pipeline);
}

// Config-controlled cutover
const handler = config.v2.orchestrate ? handleOrchestrate_V2 : handleOrchestrate_V1;
```

**Acceptance criteria per tool:**

- [ ] V2 path produces equivalent results to V1 for all test cases
- [ ] Config flag switches between V1 and V2 paths
- [ ] No MCP schema changes

**Dependencies:** All previous phases.
**Risk:** Low per tool (incremental). Tests catch regressions.

---

## Minimum Viable V2 (Thin Slice)

**Phases 1 + 2 only.** Delivers:

- TaskContract + PlanContract types
- PipelineRunner using existing GraphBuilder
- One MCP tool (`delegate_to_model`) migrated to pipeline

**Does NOT require:** Plugin registry, event bus, artifact store, policy engine.

**Estimated effort:** ~2 weeks.

---

## Phase Dependency Graph

```
Phase 1 (Types)
    ↓
Phase 2 (Pipeline Runner)
    ↓               ↘
Phase 3 (Plugins)    Phase 4 (Events + Artifacts)
    ↓                    ↓
    ↓               Phase 5 (Policy Engine)
    ↓                    ↓
    └────────────────────┘
                ↓
         Phase 6 (Tool Migration)
```

## Timeline Estimate

| Phase | Size | Dependencies | Estimated Duration      |
| ----- | ---- | ------------ | ----------------------- |
| 1     | S    | None         | 3-5 days                |
| 2     | M    | Phase 1      | 1-2 weeks               |
| 3     | L    | Phase 2      | 2-3 weeks               |
| 4     | M    | Phase 2      | 1-2 weeks               |
| 5     | M    | Phase 2, 4   | 1-2 weeks               |
| 6     | M    | All          | 2-3 weeks (incremental) |

**MVP (Phase 1+2):** ~2 weeks.
**Full V2:** ~8-12 weeks.
