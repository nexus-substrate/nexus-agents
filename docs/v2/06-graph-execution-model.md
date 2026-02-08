# 06 — Graph Execution Model

_Unifying with the existing GraphBuilder, aligned with LangGraph semantics._

---

## Current State

The existing graph execution model (`src/orchestration/graph/`) already implements most of what's needed:

| LangGraph Concept    | Nexus V1 Status                                                                  | Location            |
| -------------------- | -------------------------------------------------------------------------------- | ------------------- |
| State schema         | **Implemented** — `StateSchema` with `StateReducer<T>` (overwrite/append/custom) | graph-builder.ts    |
| Nodes                | **Implemented** — `NodeHandler = (state) => Partial<GraphState>`                 | graph-builder.ts    |
| Edges                | **Implemented** — Fixed edges + `ConditionalEdge` with router function           | graph-builder.ts    |
| Compile step         | **Implemented** — Cycle detection, reachability, entry validation                | graph-builder.ts    |
| Super-step execution | **Implemented** — BSP wavefront (parallel ready nodes)                           | graph-execution.ts  |
| Checkpointing        | **Implemented** — `ICheckpointStore` saves full state per super-step             | checkpoint-store.ts |
| Bounded iteration    | **Implemented** — `maxSteps=100`, global timeout, per-node timeout               | graph-execution.ts  |
| Recursion limits     | **Partially** — maxSteps bounds total steps, but no per-edge cycle limit         | —                   |
| Breakpoints          | **Not implemented** — No pause/resume at node level                              | —                   |
| Streaming            | **Not implemented** — Only event callbacks, no token streaming                   | —                   |

**V2 approach:** Extend the existing model. Do NOT replace it.

## V2 Extensions

### 1. Per-Edge Recursion Limits

Currently, conditional edges can route back to previous nodes (loops). The only bound is `maxSteps` (100) on total super-steps. V2 adds per-edge limits:

```typescript
interface ConditionalEdge {
  readonly from: string;
  readonly router: (state: Readonly<GraphState>) => string;
  readonly targets: readonly string[];
  readonly maxTraversals?: number; // NEW: default 3
}
```

If an edge exceeds `maxTraversals`, the router receives `__LIMIT_EXCEEDED__` and must take an alternative path or terminate.

### 2. Breakpoints

Breakpoints allow pausing execution before a specific node, dumping state for inspection, and optionally modifying state before resuming.

```typescript
interface BreakpointSpec {
  readonly nodeId: string;
  readonly condition?: (state: Readonly<GraphState>) => boolean;
  readonly action: 'pause' | 'log' | 'approve';
}
```

- `pause`: Saves checkpoint + emits `pipeline.breakpoint` event. Requires `resume()` to continue.
- `log`: Emits event with full state snapshot. Does not pause.
- `approve`: Emits event and waits for external approval (policy gate integration).

### 3. Pipeline Integration

The PipelineRunner maps PlanContract stages to graph nodes:

```typescript
function planToGraph(plan: PlanContract, registry: IPluginRegistry): CompiledGraph {
  const builder = new GraphBuilder();

  // Define state schema
  builder.setStateSchema({
    taskContract: { defaultValue: null, reducer: { type: 'overwrite' } },
    artifacts: { defaultValue: [], reducer: { type: 'append' } },
    stageResults: { defaultValue: {}, reducer: { type: 'custom', merge: mergeResults } },
  });

  // Map stages to nodes
  for (const stage of plan.stages) {
    const plugin = registry.resolve(stage.pluginId);
    builder.addNode(stage.id, createPluginHandler(plugin, stage));
  }

  // Map dependencies to edges
  for (const stage of plan.stages) {
    for (const dep of stage.dependencies) {
      builder.addEdge(dep, stage.id);
    }
  }

  // Add policy gate nodes
  for (const gate of plan.policyGates) {
    builder.addNode(`gate:${gate.id}`, createGateHandler(gate));
    builder.addEdge(gate.afterStage, `gate:${gate.id}`);
    builder.addEdge(`gate:${gate.id}`, gate.beforeStage);
  }

  return builder.compile().value;
}
```

### 4. State Schema for Pipeline

```typescript
const PIPELINE_STATE_SCHEMA: StateSchema = {
  taskContract: {
    defaultValue: null,
    reducer: { type: 'overwrite' },
  },
  artifacts: {
    defaultValue: [],
    reducer: { type: 'append' },
  },
  stageResults: {
    defaultValue: {},
    reducer: {
      type: 'custom',
      merge: (existing, incoming) => ({ ...existing, ...incoming }),
    },
  },
  errors: {
    defaultValue: [],
    reducer: { type: 'append' },
  },
  policyDecisions: {
    defaultValue: [],
    reducer: { type: 'append' },
  },
};
```

## Execution Semantics

### Super-Step Model (BSP — Unchanged from V1)

```
1. Identify READY nodes (all dependencies satisfied)
2. Execute all READY nodes in parallel
3. Collect results (Partial<GraphState>)
4. Merge results via state reducers
5. Save checkpoint
6. Emit events (stage.completed for each node)
7. Evaluate conditional edges for next READY set
8. If READY set is empty and no pending → DONE
9. If step count exceeds maxSteps → FAIL (bounded)
10. GOTO 1
```

### Error Handling

```
Node throws →
  IF retries remaining → retry with backoff
  IF no retries → mark node FAILED
  IF node FAILED →
    IF fallback edge exists → route to fallback
    IF no fallback → mark pipeline FAILED
    Emit pipeline.error event
    Save error checkpoint (resumable)
```

### Checkpoint Format

```typescript
interface PipelineCheckpoint {
  readonly executionId: string;
  readonly stepNumber: number;
  readonly state: GraphState;
  readonly completedNodes: readonly string[];
  readonly pendingNodes: readonly string[];
  readonly failedNodes: readonly string[];
  readonly timestamp: number;
}
```

Checkpoints enable:

- Resume after failure (skip completed nodes)
- Debug inspection (dump state at any step)
- Replay (re-execute from a specific checkpoint)

## Template Compilation

Graph templates (the existing 7: echo, pipeline, code-review, security-scan, security-audit, test-generation, documentation) become PlanContract generators:

```typescript
function codeReviewTemplate(input: CodeReviewInput): PlanContract {
  return {
    taskId: generateId(),
    stages: [
      { id: 'analyze', type: 'analyze', pluginId: 'nexus:task-analyzer', ... },
      { id: 'review-code', type: 'execute', pluginId: 'nexus:code-expert', ... },
      { id: 'review-security', type: 'execute', pluginId: 'nexus:security-expert', ... },
      { id: 'aggregate', type: 'aggregate', pluginId: 'nexus:consensus-voter', ... },
    ],
    policyGates: [
      { id: 'security-gate', afterStage: 'review-security', beforeStage: 'aggregate', ... },
    ],
    ...
  };
}
```

## What Changes from V1

| Aspect                | V1                          | V2                                              |
| --------------------- | --------------------------- | ----------------------------------------------- |
| Who creates the graph | GraphBuilder API directly   | PlanContract → planToGraph() compiler           |
| Node handlers         | Raw `NodeHandler` functions | Plugin.execute() wrapped in handlers            |
| State                 | `Record<string, unknown>`   | Typed `PIPELINE_STATE_SCHEMA` with TaskContract |
| Policy gates          | Not in graph                | Policy gate nodes between stages                |
| Observability         | Event callbacks             | EventBus integration at every stage boundary    |
| Resumability          | Checkpoint store            | Same, plus breakpoint support                   |
| Edge bounds           | maxSteps only               | maxSteps + per-edge maxTraversals               |

## What Does NOT Change

- GraphBuilder API
- BSP super-step execution
- State reducer semantics
- ICheckpointStore interface
- Compile-time validation (cycle detection, reachability)
- Existing 7 graph templates (wrapped as PlanContract generators)
