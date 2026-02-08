# V2 Architecture Proposal: Pipeline OS with Plugins

_A deterministic pipeline runner with policy gates, where agents are implementations of pipeline stages._

_Generated: 2026-02-08_

---

## Problem Statement

The current system (v1) works but has accumulated complexity across 650 source files. Key issues:

1. **No unified task model.** Tasks flow through SharedTaskAnalyzer, WorkflowRouter, CompositeRouter, and the Orchestrator — each with its own representation of "what to do."
2. **Agents are both framework and application.** The agents module (287 files) mixes base agent infrastructure with specific expert implementations, skills, and experimental features.
3. **Open feedback loop.** Learning infrastructure exists but doesn't influence runtime decisions.
4. **Two adapter layers.** API adapters and CLI adapters don't share a common contract above transport.
5. **Rule-based selection.** All routing/classification uses hand-coded rules with no adaptation.

---

## Core Insight

> A deterministic pipeline runner with policy gates, where agents are just implementations of pipeline stages.

The system should have ONE orchestration primitive: a **Pipeline**. Everything else — routing, consensus, security checks, code generation, review — is a **stage** in that pipeline. Policy gates between stages enforce governance.

---

## V2 Core Primitives

### 1. Task Contract

Every unit of work is a `TaskContract` — a typed, immutable description of what needs to happen.

```typescript
interface TaskContract {
  readonly id: string;
  readonly description: string;
  readonly analysis: TaskAnalysisResult; // from SharedTaskAnalyzer
  readonly constraints: TaskConstraints; // time, quality, scope
  readonly requiredCapabilities: RequiredCapabilities;
  readonly status: TaskStatus; // intake | planning | executing | validating | done | failed
  readonly parentId?: string; // for decomposed subtasks
  readonly artifacts: readonly ArtifactRef[]; // inputs/outputs
}

type TaskStatus = 'intake' | 'planning' | 'executing' | 'validating' | 'done' | 'failed';
```

**V1 analog:** Today this is split across `TaskSignals`, `TaskAnalysisResult`, `RoutingDecision`, and `PatternOutcome`. V2 unifies them.

### 2. Plan Contract

Before execution, every task gets a `PlanContract` — an explicit execution plan.

```typescript
interface PlanContract {
  readonly taskId: string;
  readonly stages: readonly StageSpec[];
  readonly policyGates: readonly PolicyGateSpec[];
  readonly estimatedCost: CostEstimate;
  readonly approvalRequired: boolean;
}

interface StageSpec {
  readonly id: string;
  readonly type: StageType; // 'analyze' | 'route' | 'execute' | 'validate' | 'aggregate'
  readonly plugin: string; // which plugin handles this stage
  readonly inputArtifacts: string[];
  readonly outputArtifacts: string[];
  readonly config: Record<string, unknown>;
}
```

**V1 analog:** Today the WorkflowRouter selects a pattern (sequential/wave/graph) but doesn't produce an explicit plan. The graph builder creates DAGs but only for graph-type patterns.

### 3. Policy Engine

Policy gates sit between pipeline stages. They are the governance enforcement layer.

```typescript
interface PolicyEngine {
  evaluate(gate: PolicyGateSpec, context: PolicyContext): PolicyDecision;
}

interface PolicyGateSpec {
  readonly id: string;
  readonly stage: string; // which stage this gate follows
  readonly rules: readonly PolicyRule[];
  readonly onFail: 'block' | 'warn' | 'escalate';
}

type PolicyDecision = { allow: true } | { allow: false; reason: string; escalateTo?: string };
```

**V1 analog:** The gateway middleware classifies tiers but doesn't enforce. The security policy gate evaluates typed actions. V2 unifies these into one policy engine that applies at every stage boundary.

### 4. Artifact Store

All inputs and outputs flow through a typed artifact store.

```typescript
interface ArtifactStore {
  put(artifact: Artifact): ArtifactRef;
  get(ref: ArtifactRef): Artifact | undefined;
  query(filter: ArtifactFilter): readonly ArtifactRef[];
}

interface Artifact {
  readonly id: string;
  readonly type: ArtifactType; // 'code' | 'review' | 'plan' | 'test' | 'report'
  readonly content: unknown;
  readonly metadata: ArtifactMetadata;
  readonly provenance: ProvenanceChain; // who created it and from what
}
```

**V1 analog:** Today artifacts are implicit — passed as function arguments between components. There's no central store or provenance tracking beyond the audit trail.

### 5. Event Bus

Every state change emits a typed event. Enables observability, debugging, and replay.

```typescript
interface EventBus {
  emit(event: PipelineEvent): void;
  subscribe(filter: EventFilter, handler: EventHandler): Unsubscribe;
}

type PipelineEvent =
  | { type: 'task.created'; task: TaskContract }
  | { type: 'stage.started'; stageId: string; taskId: string }
  | { type: 'stage.completed'; stageId: string; result: StageResult }
  | { type: 'policy.evaluated'; gate: string; decision: PolicyDecision }
  | { type: 'artifact.created'; ref: ArtifactRef }
  | { type: 'task.completed'; taskId: string; outcome: TaskOutcome };
```

**V1 analog:** The gateway logs events. The graph executor emits node events. But there's no unified event bus. V2 makes events first-class across all pipeline stages.

---

## Plugin Architecture

Everything that does actual work is a plugin. Plugins implement pipeline stages.

### Plugin Interface

```typescript
interface PipelinePlugin {
  readonly id: string;
  readonly version: string;
  readonly stages: readonly string[]; // which stage types this plugin handles
  readonly requiredCapabilities: string[]; // what this plugin needs to function

  execute(stage: StageSpec, context: StageContext): Promise<StageResult>;
  validate(config: unknown): ValidationResult; // validate plugin config
}
```

### Standard Plugins (migrated from v1)

| Plugin                  | Stage Types         | V1 Source                      |
| ----------------------- | ------------------- | ------------------------------ |
| `task-analyzer`         | analyze             | SharedTaskAnalyzer             |
| `model-router`          | route               | CompositeRouter                |
| `cli-executor`          | execute             | CLI adapters                   |
| `consensus-voter`       | validate, aggregate | ConsensusEngine                |
| `code-reviewer`         | validate            | code_expert                    |
| `security-auditor`      | validate            | security_expert                |
| `graph-runner`          | execute             | GraphBuilder + executeGraph    |
| `spec-parser`           | analyze             | parseSpec + decomposeSpec      |
| `research-engine`       | analyze             | research tools                 |
| `requirements-elicitor` | intake              | pm_expert + requirements skill |

### Plugin Isolation Rules

1. Plugins MAY NOT import from other plugins directly.
2. Plugins communicate ONLY through artifacts and events.
3. Plugins declare their required capabilities; the pipeline runner validates before execution.
4. Plugins that call external models MUST go through the unified adapter interface.

---

## Software Factory as State Machine

The AI Software Factory becomes an explicit state machine with bounded stages.

```
                    ┌─────────┐
                    │ INTAKE  │ ← Natural language spec arrives
                    └────┬────┘
                         │ parse + validate
                    ┌────▼────────┐
                    │ ELICITATION │ ← Clarify ambiguities, fill gaps
                    └────┬────────┘
                         │ requirements complete
                    ┌────▼────────┐
                    │ SYNTHESIS   │ ← Decompose into subtasks + plan
                    └────┬────────┘
                         │ plan approved
              ┌──────────▼──────────┐
              │ IMPLEMENTATION      │ ← Execute plan stages
              │ (bounded iterations)│
              └──────────┬──────────┘
                         │ all stages done
                    ┌────▼──────┐
                    │ VALIDATION│ ← Run acceptance criteria
                    └────┬──────┘
                    ┌────▼──────┐
                    │ CLOSEOUT  │ ← Generate artifacts, update docs
                    └───────────┘
```

### Stage Entry/Exit Criteria

| Stage          | Entry Criteria                 | Exit Criteria                    | Max Iterations      |
| -------------- | ------------------------------ | -------------------------------- | ------------------- |
| Intake         | Spec text exists               | Parsed spec validates            | 1                   |
| Elicitation    | Ambiguity score > threshold    | All required fields populated    | 3                   |
| Synthesis      | Requirements complete          | Plan approved (policy gate)      | 2                   |
| Implementation | Plan exists, budget available  | All subtasks complete or failed  | N (bounded by plan) |
| Validation     | Implementation artifacts exist | Acceptance criteria pass or fail | 2                   |
| Closeout       | Validation complete            | Artifacts stored, docs updated   | 1                   |

### Bounded Iteration Rule

No stage may iterate more than its max. If a stage exhausts iterations without meeting exit criteria, the task fails with a clear reason. No unbounded retries.

---

## Migration Path: V1 to V2

### Phase 1: Unified Task Model (Non-breaking)

- Define `TaskContract` and `PlanContract` types
- Wrap existing `TaskSignals` + `TaskAnalysisResult` + `RoutingDecision` into TaskContract
- Add adapters so existing MCP tools can produce/consume TaskContracts
- No behavioral changes — just a new layer

### Phase 2: Pipeline Runner (Additive)

- Implement `PipelineRunner` that executes `PlanContract` stages sequentially
- Wrap existing components as plugins (SharedTaskAnalyzer -> task-analyzer plugin, etc.)
- Add policy gates between stages (using existing security/policy-gate.ts infrastructure)
- New MCP tool: `execute_pipeline` alongside existing `orchestrate`

### Phase 3: Event Bus + Artifact Store (Additive)

- Implement in-memory EventBus with typed events
- Implement ArtifactStore with provenance tracking
- Wire pipeline runner to emit events at every stage boundary
- Gateway dashboard can subscribe to events for real-time observability

### Phase 4: Close the Learning Loop

- Wire OutcomeStore -> LinUCB feedback path
- EventBus enables: every task completion event feeds back to the router
- A/B testing becomes: route 10% of tasks through experimental pipeline

### Phase 5: Agent Module Decomposition

- Split `src/agents/` (287 files) into:
  - `src/agent-framework/` — BaseAgent, StateMachine, ContextManager (framework)
  - `src/experts/` — Expert implementations (application)
  - `src/skills/` — Reusable skill implementations (application)
  - Archive experimental features (SICA, Forest-of-Thought, ICTM) into `src/experimental/`

---

## What We Are NOT Doing

1. **Not rewriting from scratch.** Every phase is additive or wrapping. Existing 20 MCP tools continue to work.
2. **Not adding ML/RL yet.** V2 is still rule-based. Adaptive routing is Phase 4, and it uses the existing LinUCB bandit.
3. **Not changing the MCP protocol.** The external interface stays the same.
4. **Not merging adapter layers yet.** API and CLI adapters remain separate. A unified `IModelAdapter` is a future consideration.

---

## Success Criteria

V2 is "done" when:

1. Every MCP tool call produces a `TaskContract` with a lifecycle (intake -> done/failed).
2. The `execute_pipeline` tool runs arbitrary `PlanContract` stage sequences.
3. Policy gates can block a stage transition and explain why.
4. Every stage transition emits a typed event.
5. Outcome data feeds back into routing decisions within the same session.
6. The `agents/` module is decomposed into 3+ focused modules.

---

## Supporting Documents

- [as-is.md](./as-is.md) — Current state assessment
- [components.md](./components.md) — Component inventory
- [interfaces.md](./interfaces.md) — Current interface contracts
- [flows.md](./flows.md) — Current dataflow traces
- [gaps.md](./gaps.md) — Known gaps
- [ARCHITECTURE_MAP.json](./ARCHITECTURE_MAP.json) — Machine-readable map
