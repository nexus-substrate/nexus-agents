# 04 — V2 Architecture: Pipeline OS with Plugins

_This is the final corrected V2 plan. Supersedes `docs/design/v2-proposal.md`._

---

## Core Thesis

The system has ONE execution primitive: a **compiled graph pipeline** that runs **stages** in dependency order with **policy gates** between them. Everything else — routing, analysis, expert agents, consensus, research — is a **plugin** that implements one or more stage types.

This is not a new concept for the codebase. The existing `GraphBuilder` + `executeGraph` model already provides: compile-time validation, BSP super-step execution, state reducers, conditional edges, checkpointing, and bounded iteration. V2 promotes this from "one orchestration pattern among six" to "the only orchestration primitive."

## Architecture Diagram

```
                          ┌─────────────────┐
                          │   MCP Server     │
                          │  (20+ tools)     │
                          └────────┬─────────┘
                                   │
                          ┌────────▼─────────┐
                          │  Task Intake      │
                          │  (TaskContract)   │
                          └────────┬─────────┘
                                   │
                          ┌────────▼─────────┐
                          │  Plan Compiler    │
                          │  (PlanContract    │
                          │   → CompiledGraph)│
                          └────────┬─────────┘
                                   │
                 ┌─────────────────┼─────────────────┐
                 │                 │                  │
          ┌──────▼──────┐  ┌──────▼──────┐  ┌───────▼──────┐
          │  Stage N     │  │  Stage N+1  │  │  Stage N+2   │
          │  (Plugin A)  │  │  (Plugin B) │  │  (Plugin C)  │
          └──────┬──────┘  └──────┬──────┘  └───────┬──────┘
                 │                │                  │
          ┌──────▼──────┐  ┌─────▼───────┐  ┌──────▼──────┐
          │ Policy Gate │  │ Policy Gate  │  │ Policy Gate  │
          └──────┬──────┘  └─────┬───────┘  └──────┬──────┘
                 │                │                  │
                 └────────────────┼──────────────────┘
                                  │
                          ┌───────▼──────┐
                          │ Artifact     │
                          │ Store        │
                          └───────┬──────┘
                                  │
                          ┌───────▼──────┐
                          │ Event Bus    │
                          └──────────────┘
```

## Core Primitives

### 1. TaskContract

The single typed representation of a unit of work throughout its lifecycle.

```typescript
interface TaskContract {
  readonly id: string;
  readonly description: string;
  readonly status: TaskStatus;
  readonly analysis: TaskAnalysisResult;
  readonly constraints: TaskConstraints;
  readonly requiredCapabilities: RequiredCapabilities;
  readonly capabilityGaps: CapabilityGapReport;
  readonly parentId?: string;
  readonly artifacts: readonly ArtifactRef[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

type TaskStatus =
  | 'intake' // Received, being analyzed
  | 'clarifying' // Ambiguous, awaiting user input
  | 'planning' // Plan being compiled
  | 'approved' // Plan approved by user/policy
  | 'executing' // Pipeline running
  | 'validating' // Results being checked
  | 'done' // Successfully completed
  | 'failed'; // Failed with reason
```

**Migration from V1:** Wrap existing `TaskSignals` + `TaskAnalysisResult` + `RoutingDecision` into one TaskContract. Existing tools produce/consume it via adapters.

### 2. PlanContract

An explicit execution plan — a list of stages with dependencies and policy gates.

```typescript
interface PlanContract {
  readonly taskId: string;
  readonly stages: readonly StageSpec[];
  readonly policyGates: readonly PolicyGateSpec[];
  readonly estimatedCost: CostEstimate;
  readonly approvalRequired: boolean;
  readonly maxIterations: number; // bounded
  readonly timeoutMs: number; // bounded
}

interface StageSpec {
  readonly id: string;
  readonly type: StageType;
  readonly pluginId: string;
  readonly inputArtifacts: readonly string[];
  readonly outputArtifacts: readonly string[];
  readonly dependencies: readonly string[]; // stage IDs that must complete first
  readonly config: Record<string, unknown>;
  readonly preferredCli?: CliNameLiteral;
}

type StageType =
  | 'analyze' // Task analysis, requirement extraction
  | 'route' // Model/CLI selection
  | 'execute' // Run model, generate code, produce artifacts
  | 'validate' // Check results against criteria
  | 'aggregate' // Combine results from parallel stages
  | 'gate'; // Policy check, approval request
```

**Migration from V1:** The PlanContract replaces the implicit pattern selection in WorkflowRouter. Instead of selecting "wave" or "graph" and hoping the right thing happens, the plan explicitly declares each stage, its plugin, and its dependencies.

### 3. Pipeline Runner

Executes a PlanContract using the existing GraphBuilder/executeGraph infrastructure.

```typescript
interface IPipelineRunner {
  compile(plan: PlanContract): Result<CompiledPipeline, CompileError>;
  execute(pipeline: CompiledPipeline, context: PipelineContext): Promise<PipelineResult>;
  resume(checkpointId: string): Promise<PipelineResult>;
}
```

**Key insight:** The PipelineRunner does NOT replace GraphBuilder. It uses it. A PlanContract's stages and dependencies map directly to graph nodes and edges. The existing compile step (cycle detection, reachability check) validates the plan. The existing super-step execution runs stages in parallel where dependencies allow.

**What changes:** The GraphBuilder currently operates on `NodeHandler = (state) => Partial<GraphState>`. V2 wraps each stage in a handler that:

1. Loads the plugin
2. Passes the stage spec and artifacts
3. Captures output artifacts
4. Emits events
5. Returns updated state

### 4. Plugin Registry

Structural isolation for all stage implementations. See `05-plugin-system-spec.md` for full details.

```typescript
interface IPluginRegistry {
  register(manifest: PluginManifest): Result<void, RegistrationError>;
  resolve(pluginId: string): PipelinePlugin | undefined;
  listEnabled(): readonly PluginManifest[];
}
```

### 5. Policy Engine

Governance gates between stages. See `07-policy-governance-gates.md` for full details.

```typescript
interface IPolicyEngine {
  evaluate(gate: PolicyGateSpec, context: PolicyContext): PolicyDecision;
  registerRule(rule: PolicyRule): void;
}
```

### 6. Artifact Store

Typed storage for all pipeline inputs and outputs.

```typescript
interface IArtifactStore {
  put(artifact: Artifact): ArtifactRef;
  get(ref: ArtifactRef): Artifact | undefined;
  query(filter: ArtifactFilter): readonly ArtifactRef[];
}
```

### 7. Event Bus

Typed events at every state change. See `08-observability-eventing.md` for full details.

```typescript
interface IEventBus {
  emit(event: PipelineEvent): void;
  subscribe(filter: EventFilter, handler: EventHandler): Unsubscribe;
}
```

## How Existing Features Map to V2

### MCP Tools

| V1 Tool                            | V2 Behavior                                                            |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `orchestrate`                      | Creates TaskContract → compiles PlanContract → executes pipeline       |
| `delegate_to_model`                | Single-stage pipeline: route → execute                                 |
| `consensus_vote`                   | Multi-stage pipeline: N parallel execute stages → aggregate            |
| `run_graph_workflow`               | Compiles template → PlanContract → pipeline                            |
| `execute_spec`                     | Multi-stage pipeline: parse → decompose → compile → execute → validate |
| `create_expert` / `execute_expert` | Plugin instantiation → single-stage execute                            |
| List/query tools                   | Pass-through, no pipeline needed                                       |

### Orchestration Patterns

| V1 Pattern   | V2 Equivalent                                               |
| ------------ | ----------------------------------------------------------- |
| `sequential` | PlanContract with linear stage dependencies                 |
| `wave`       | PlanContract with independent stages (parallel super-step)  |
| `graph`      | PlanContract maps directly to compiled graph                |
| `consensus`  | PlanContract: N parallel execute stages → 1 aggregate stage |
| `aflow`      | Plugin with exploration strategy, runs as execute stage     |
| `puppeteer`  | Plugin (experimental, default off)                          |

## V1 → V2 Adapter Layer

During migration, a `V1CompatAdapter` translates between old and new:

```typescript
function taskSignalsToContract(signals: TaskSignals, analysis: TaskAnalysisResult): TaskContract;
function routingDecisionToPlan(decision: RoutingDecision, contract: TaskContract): PlanContract;
function pipelineResultToToolResponse(result: PipelineResult): MCP.CallToolResult;
```

This allows existing MCP tool handlers to adopt V2 incrementally — one tool at a time.

## What This Architecture Does NOT Include

1. **No ML/RL routing.** Rule-based + bandit, same as V1.
2. **No distributed execution.** Single process.
3. **No custom DSL.** TypeScript types and Zod schemas only.
4. **No breaking MCP changes.** Tool schemas stay the same.
