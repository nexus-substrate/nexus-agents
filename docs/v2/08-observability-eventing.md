# 08 — Observability & Eventing

---

## Current State

V1 has fragmented observability:

| Mechanism               | Location             | Scope                          |
| ----------------------- | -------------------- | ------------------------------ |
| Logger (`createLogger`) | core/logger.ts       | Per-component structured logs  |
| Tracer (`getTracer`)    | core/tracer.ts       | OpenTelemetry spans (optional) |
| Gateway log             | mcp/gateway/         | Tool call tier + duration      |
| Graph events            | orchestration/graph/ | Node start/complete callbacks  |
| Audit trail             | security/audit/      | Security decisions only        |

There is no unified event stream. A developer cannot reconstruct the full execution trace of a task.

## V2 Event Bus

### Interface

```typescript
interface IEventBus {
  /**
   * Emit a typed event. Fire-and-forget — handlers should not throw.
   */
  emit(event: PipelineEvent): void;

  /**
   * Subscribe to events matching a filter. Returns unsubscribe function.
   */
  subscribe(filter: EventFilter, handler: EventHandler): Unsubscribe;

  /**
   * Query recent events (bounded buffer). For debugging and replay.
   */
  query(filter: EventFilter, limit?: number): readonly PipelineEvent[];
}

type EventHandler = (event: PipelineEvent) => void;
type Unsubscribe = () => void;

interface EventFilter {
  readonly type?: string | readonly string[];
  readonly taskId?: string;
  readonly stageId?: string;
  readonly since?: number; // timestamp
}
```

### Event Types

```typescript
type PipelineEvent =
  // Task lifecycle
  | { type: 'task.created'; taskId: string; task: TaskContract; timestamp: number }
  | {
      type: 'task.status_changed';
      taskId: string;
      from: TaskStatus;
      to: TaskStatus;
      timestamp: number;
    }
  | { type: 'task.completed'; taskId: string; outcome: TaskOutcome; timestamp: number }
  | { type: 'task.failed'; taskId: string; error: string; timestamp: number }

  // Pipeline lifecycle
  | { type: 'pipeline.compiled'; taskId: string; plan: PlanContract; timestamp: number }
  | { type: 'pipeline.started'; taskId: string; executionId: string; timestamp: number }
  | { type: 'pipeline.checkpoint'; executionId: string; stepNumber: number; timestamp: number }
  | {
      type: 'pipeline.completed';
      executionId: string;
      success: boolean;
      durationMs: number;
      timestamp: number;
    }
  | {
      type: 'pipeline.breakpoint';
      executionId: string;
      nodeId: string;
      state: GraphState;
      timestamp: number;
    }

  // Stage lifecycle
  | {
      type: 'stage.started';
      executionId: string;
      stageId: string;
      pluginId: string;
      timestamp: number;
    }
  | {
      type: 'stage.completed';
      executionId: string;
      stageId: string;
      result: StageResult;
      durationMs: number;
      timestamp: number;
    }
  | { type: 'stage.failed'; executionId: string; stageId: string; error: string; timestamp: number }
  | {
      type: 'stage.retrying';
      executionId: string;
      stageId: string;
      attempt: number;
      timestamp: number;
    }

  // Policy gates
  | {
      type: 'policy.evaluated';
      executionId: string;
      gateId: string;
      decision: PolicyDecision;
      timestamp: number;
    }
  | {
      type: 'policy.escalated';
      executionId: string;
      gateId: string;
      escalateTo: string;
      timestamp: number;
    }
  | {
      type: 'policy.approved';
      executionId: string;
      gateId: string;
      approvedBy: string;
      timestamp: number;
    }

  // Artifacts
  | { type: 'artifact.created'; executionId: string; ref: ArtifactRef; timestamp: number }
  | {
      type: 'artifact.accessed';
      executionId: string;
      ref: ArtifactRef;
      accessor: string;
      timestamp: number;
    }

  // Model calls (for cost tracking)
  | {
      type: 'model.called';
      executionId: string;
      cli: string;
      model: string;
      tokensIn: number;
      tokensOut: number;
      durationMs: number;
      timestamp: number;
    }

  // Routing
  | {
      type: 'routing.decision';
      taskId: string;
      selectedModel: string;
      scores: Record<string, number>;
      timestamp: number;
    };
```

### Correlation

Every event carries:

- `taskId`: Links to the originating TaskContract
- `executionId`: Links to a specific pipeline run
- `timestamp`: Monotonic clock (Date.now())

This enables full trace reconstruction: given a taskId, query all events → reconstruct timeline.

## Artifact Store

### Interface

```typescript
interface IArtifactStore {
  /**
   * Store an artifact and return a reference.
   */
  put(artifact: Artifact): ArtifactRef;

  /**
   * Retrieve an artifact by reference.
   */
  get(ref: ArtifactRef): Artifact | undefined;

  /**
   * Query artifacts by filter.
   */
  query(filter: ArtifactFilter): readonly ArtifactRef[];

  /**
   * Get the provenance chain for an artifact.
   */
  provenance(ref: ArtifactRef): readonly ProvenanceEntry[];
}

interface Artifact {
  readonly id: string;
  readonly type: ArtifactType;
  readonly content: unknown;
  readonly metadata: ArtifactMetadata;
  readonly createdBy: string; // plugin ID or stage ID
  readonly createdAt: number;
  readonly inputRefs: readonly ArtifactRef[]; // what was used to produce this
}

type ArtifactType =
  | 'code' // Generated source code
  | 'review' // Code/security/architecture review
  | 'plan' // Execution plan
  | 'test' // Test suite
  | 'report' // Analysis report
  | 'vote' // Consensus vote result
  | 'spec' // Parsed specification
  | 'analysis'; // Task analysis result

interface ArtifactRef {
  readonly id: string;
  readonly type: ArtifactType;
}

interface ArtifactMetadata {
  readonly trustTier?: number;
  readonly model?: string;
  readonly cli?: string;
  readonly reviewer?: string;
  readonly decision?: string;
  readonly [key: string]: unknown;
}

interface ProvenanceEntry {
  readonly artifactId: string;
  readonly stage: string;
  readonly plugin: string;
  readonly timestamp: number;
  readonly inputArtifacts: readonly string[];
}
```

### Storage Bounds

- In-memory implementation (V2 MVP)
- Bounded: max 1000 artifacts per pipeline execution
- Max artifact content size: 1MB
- Eviction: LRU when bound exceeded
- Persistence: checkpoint store includes artifact refs (not full content)

## Integration Points

### Closing the Feedback Loop

The event bus enables the feedback loop that V1 lacks:

```
stage.completed event
    → EventBus subscriber
    → OutcomeStore.record({ model, success, duration, taskType })
    → Next routing.decision reads OutcomeStore
    → LinUCB bandit adjusts exploration based on outcomes
```

### Gateway Migration

The gateway middleware becomes an event producer:

```typescript
// V1: gateway-middleware.ts logs internally
// V2: gateway emits events that consumers subscribe to
gateway.on('tool.dispatched', (event) => {
  eventBus.emit({
    type: 'stage.started',
    executionId: event.requestId,
    stageId: event.toolName,
    pluginId: `mcp:${event.toolName}`,
    timestamp: Date.now(),
  });
});
```

### TUI Dashboard

The TUI (Phase 2, #873) subscribes to the event bus for live updates:

```typescript
eventBus.subscribe({ type: ['stage.started', 'stage.completed', 'policy.evaluated'] }, (event) => {
  dashboard.updateProgress(event);
});
```

## Implementation Plan

1. **Phase 1:** In-memory EventBus + ArtifactStore. No persistence.
2. **Phase 2:** Wire PipelineRunner to emit events at stage boundaries.
3. **Phase 3:** Wire feedback loop (events → OutcomeStore → routing).
4. **Phase 4:** Wire TUI dashboard to event bus.
