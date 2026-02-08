# 09 — Context Store & Turn DAG Option

---

## Problem

Pipeline stages produce and consume context (artifacts, state, intermediate results). Currently, state flows through `GraphState = Record<string, unknown>` — a flat, untyped bag. This works for simple pipelines but breaks down when:

1. Multiple stages write to the same key (merge conflicts)
2. Debugging requires understanding _how_ a value was produced
3. Stages need partial views of state (not the full bag)
4. Resumability requires understanding which state is stale after a stage re-run

## Options Evaluated

### Option A: Minimal In-House (Recommended for V2)

Extend the existing GraphState with typed channels and provenance:

```typescript
interface ContextStore {
  /** Get a typed value from a named channel */
  get<T>(channel: string): T | undefined;

  /** Set a typed value with provenance */
  set<T>(channel: string, value: T, source: ProvenanceSource): void;

  /** Get the full provenance chain for a channel */
  history(channel: string): readonly ContextEntry[];

  /** Create a scoped view (read access to specific channels only) */
  scope(channels: readonly string[]): ReadonlyContextStore;

  /** Snapshot for checkpointing */
  snapshot(): ContextSnapshot;

  /** Restore from snapshot */
  restore(snapshot: ContextSnapshot): void;
}

interface ContextEntry {
  readonly channel: string;
  readonly value: unknown;
  readonly source: ProvenanceSource;
  readonly timestamp: number;
  readonly stepNumber: number;
}

interface ProvenanceSource {
  readonly stageId: string;
  readonly pluginId: string;
  readonly inputChannels: readonly string[];
}
```

**Integration with GraphState:** The ContextStore wraps GraphState. State reducers become channel write policies:

```typescript
// V1: state reducers
const schema = {
  artifacts: { defaultValue: [], reducer: { type: 'append' } },
};

// V2: equivalent channel definition
contextStore.defineChannel('artifacts', {
  defaultValue: [],
  writePolicy: 'append', // overwrite | append | custom
  readScope: 'all', // all | stage-local | explicit
});
```

**Pros:** Minimal new code. Wraps existing infrastructure. Provenance tracking enables debugging.

**Cons:** No cross-session persistence. No distributed state. Limited query capabilities.

### Option B: Turn DAG (CXDB-Inspired)

A directed acyclic graph of "turns" (state transitions), where each node represents a stage execution and edges represent state flow:

```
Turn 0 (intake)
    ↓
Turn 1 (analyze)
    ↓         ↘
Turn 2a        Turn 2b
(code_expert)  (security_expert)
    ↓         ↙
Turn 3 (aggregate)
    ↓
Turn 4 (validate)
```

Each turn captures:

- Input state (channels read)
- Output state (channels written)
- Duration, cost, model used
- Full provenance chain

**Pros:** Natural model for pipeline execution. Enables replay (re-execute from any turn). Supports branching (what-if analysis).

**Cons:** More complex. Requires graph storage. Overkill for V2 MVP.

### Option C: External Integration (LangSmith / Weave)

Integrate with an external observability platform for context tracking.

**Pros:** Production-grade. Rich UI. Shared with team.

**Cons:** External dependency. Not self-contained. Requires API keys and network.

## Decision

**Option A for V2 MVP.** Option B is a Phase 4+ consideration. Option C is NG (non-goal — nexus-agents is local tooling).

## Implementation

### Channel Definitions for Standard Pipeline

```typescript
const PIPELINE_CHANNELS = {
  // Task metadata (set once at intake)
  task: { writePolicy: 'overwrite', readScope: 'all' },
  plan: { writePolicy: 'overwrite', readScope: 'all' },

  // Accumulated artifacts (append-only)
  artifacts: { writePolicy: 'append', readScope: 'all' },
  errors: { writePolicy: 'append', readScope: 'all' },

  // Stage results (keyed by stage ID)
  results: { writePolicy: 'merge-by-key', readScope: 'all' },

  // Policy decisions (append-only)
  'policy-decisions': { writePolicy: 'append', readScope: 'all' },

  // Model call tracking (append-only)
  'model-calls': { writePolicy: 'append', readScope: 'all' },

  // User interaction (overwrite — latest user response)
  'user-response': { writePolicy: 'overwrite', readScope: 'all' },
};
```

### Scoped Views

Plugins receive scoped context views — they cannot access channels outside their declared scope:

```typescript
// Plugin manifest declares channel access
const manifest: PluginManifest = {
  id: 'nexus:code-expert',
  channels: {
    reads: ['task', 'artifacts'],
    writes: ['artifacts', 'results'],
  },
  // ...
};

// PipelineRunner enforces scope
const scopedContext = contextStore.scope(manifest.channels.reads);
const result = await plugin.execute(stage, { context: scopedContext, ... });
// Only writes to declared channels are accepted
```

### Storage Bounds

- Max channels per pipeline: 50
- Max entries per channel history: 100
- Max total context size: 10MB
- Snapshot serialization: JSON (for checkpointing)
