# OrchestrationObserver Architecture Design

> **Note:** This component was renamed from `SwarmObserver` to `OrchestrationObserver` in v2.24 (Issue #251). The design and API remain the same; only the names changed.

**Author:** System Architecture Designer
**Date:** 2026-01-09 (ET)
**Status:** Enhancement Proposal (Partially Implemented)
**Issue:** #158 (Original), TBD (Enhancements)
**Existing Implementation:** `packages/nexus-agents/src/observability/`

---

## 1. Overview

This document describes the SwarmObserver architecture and proposes enhancements to the existing implementation. The SwarmObserver is an observability component for nexus-agents that tracks inter-agent interactions as a directed graph, detects bottlenecks, identifies emergent clusters, and attributes success to contributing agents.

### 1.1 Existing Implementation Status

The current implementation (`packages/nexus-agents/src/observability/`) provides:

| Component          | File                      | Status   |
| ------------------ | ------------------------- | -------- |
| Types & Interfaces | `swarm-observer-types.ts` | Complete |
| Interaction Graph  | `interaction-graph.ts`    | Complete |
| SwarmObserver      | `swarm-observer.ts`       | Complete |
| Tests              | `*.test.ts`               | Complete |

**Key existing features:**

- OpenTelemetry-compatible trace IDs (32-char hex) and span IDs (16-char hex)
- Directed interaction graph with Kosaraju's algorithm for SCCs
- Bottleneck detection based on queue depth
- Cluster detection using strongly connected components
- Success attribution with contribution scoring
- Health metrics aggregation

### 1.2 Requirements Summary

| Requirement | Status     | Description                                                      |
| ----------- | ---------- | ---------------------------------------------------------------- |
| R1          | DONE       | Track all inter-agent interactions as a directed graph           |
| R2          | DONE       | Detect bottlenecks (agents blocking others)                      |
| R3          | DONE       | Identify emergent clusters (agents that naturally work together) |
| R4          | DONE       | Attribute success to contributing agents                         |
| R5          | DONE       | Support OpenTelemetry-compatible trace IDs                       |
| R6          | NEEDS WORK | Minimal performance overhead (< 5ms per interaction)             |

### 1.3 Proposed Enhancements

| ID  | Priority | Description                                               |
| --- | -------- | --------------------------------------------------------- |
| E1  | P1       | W3C Trace Context header support (traceparent/tracestate) |
| E2  | P1       | Critical path analysis for success attribution            |
| E3  | P2       | Louvain algorithm for better cluster detection            |
| E4  | P2       | Real-time bottleneck event callbacks                      |
| E5  | P3       | OTLP export for external observability tools              |
| E6  | P3       | Performance benchmarking and optimization                 |

---

## 2. Existing Architecture

### 2.1 Current Type Definitions

```typescript
// From swarm-observer-types.ts

// ID types (OpenTelemetry compatible)
type AgentId = string;
type TraceId = string; // 32-char hex (128-bit)
type SpanId = string; // 16-char hex (64-bit)

// Event structure
interface AgentEvent {
  eventId: string;
  timestamp: string;
  agentId: AgentId;
  eventType: EventType;
  traceId: TraceId;
  spanId: SpanId;
  parentSpanId?: SpanId;
  payload: EventPayload;
  durationMs?: number;
}

// Interaction edge in the graph
interface InteractionEdge {
  from: AgentId;
  to: AgentId;
  interactionType: string;
  timestamp: string;
  outcome: InteractionOutcome;
  durationMs?: number;
  traceId: TraceId;
  weight: number;
}
```

### 2.2 Current Graph Implementation

The `DirectedInteractionGraph` class provides:

- **Node/Edge Management**: O(1) add/lookup via Map
- **Centrality Analysis**: Degree centrality calculation
- **SCC Detection**: Kosaraju's algorithm for strongly connected components
- **Clustering**: Local clustering coefficient per node
- **Statistics**: Graph density, success rate, latency

### 2.3 Current SwarmObserver Implementation

The `SwarmObserver` class implements:

- **Event Recording**: With memory-bounded buffer (default 10,000 events)
- **Interaction Recording**: Adds edges to graph with outcome tracking
- **Bottleneck Detection**: Based on queue depth thresholds
- **Cluster Detection**: Using SCCs with cohesion filtering
- **Success Attribution**: Score-based contribution calculation
- **Health Metrics**: Aggregated swarm-level statistics

---

## 3. Proposed Enhancements

### 3.1 Enhancement E1: W3C Trace Context Support

Add proper W3C Trace Context header support for interoperability with external tracing systems.

**New file: `otel-context.ts`**

```typescript
/**
 * W3C Trace Context compatible context.
 */
export interface OTelContext {
  readonly traceId: string; // 32 hex chars
  readonly spanId: string; // 16 hex chars
  readonly parentSpanId?: string;
  readonly traceFlags?: number; // 8-bit flags
}

/**
 * Format context as W3C traceparent header.
 * Format: {version}-{trace-id}-{span-id}-{trace-flags}
 */
export function toTraceparent(context: OTelContext): string {
  const flags = context.traceFlags?.toString(16).padStart(2, '0') ?? '01';
  return `00-${context.traceId}-${context.spanId}-${flags}`;
}

/**
 * Parse W3C traceparent header.
 */
export function fromTraceparent(header: string): OTelContext | undefined {
  const parts = header.split('-');
  if (parts.length !== 4 || parts[0] !== '00') return undefined;
  // Validate and extract trace/span IDs
}
```

### 3.2 Enhancement E2: Critical Path Analysis

Add critical path detection for better success attribution.

```typescript
/**
 * Enhanced contribution score with critical path weighting.
 */
interface EnhancedContributionScore extends ContributionScore {
  readonly onCriticalPath: boolean;
  readonly criticalPathWeight: number;
}

/**
 * Calculate critical path through task's interaction graph.
 */
function calculateCriticalPath(interactions: InteractionEdge[]): AgentId[] {
  // Build DAG from interactions
  // Find longest path (critical path in project scheduling)
  // Return ordered agent IDs
}
```

### 3.3 Enhancement E3: Louvain Cluster Detection

Replace SCC-based clustering with Louvain algorithm for better community detection.

```typescript
/**
 * Louvain community detection algorithm.
 * Better than SCC for finding overlapping collaboration patterns.
 */
function detectCommunitiesLouvain(graph: InteractionGraph): AgentCluster[] {
  // Phase 1: Modularity optimization
  // Phase 2: Community aggregation
  // Filter by minimum cohesion
}
```

### 3.4 Enhancement E4: Real-time Event Callbacks

Add event subscription system for real-time bottleneck alerts.

```typescript
type OnBottleneckDetected = (bottleneck: BottleneckInfo) => void;
type OnClusterFormed = (cluster: AgentCluster) => void;

// In SwarmObserver class:
onBottleneck(callback: OnBottleneckDetected): () => void {
  this.bottleneckListeners.add(callback);
  return () => this.bottleneckListeners.delete(callback);
}
```

---

## 4. Integration Strategy

### 4.1 Injection Points

The SwarmObserver should be injected at these integration points:

| Component              | Integration Point          | What to Observe      |
| ---------------------- | -------------------------- | -------------------- |
| `CollaborationSession` | `submitResult()`, `vote()` | Expert interactions  |
| `Orchestrator`         | `delegateToExpert()`       | Delegation events    |
| `BaseAgent`            | `handleMessage()`          | Inter-agent messages |
| `WorkflowEngine`       | Step execution             | Sequential handoffs  |

### 4.2 Example Integration

```typescript
// In collaboration-session.ts
import { getSwarmObserver } from '../observability/index.js';

submitResult(expertId: string, result: TaskResult): Result<void, AgentError> {
  const observer = getSwarmObserver();

  // Record interaction
  observer.recordInteraction(
    expertId,
    'session',
    'response',
    'success',
    SwarmObserver.generateTraceId(),
    result.metadata.durationMs
  );

  // ... existing logic ...
}
```

---

## 5. Performance Strategy

To meet the < 5ms performance requirement:

1. **O(1) Interaction Recording** - Use Map for node/edge lookups
2. **Lazy Analysis** - Bottleneck/cluster detection runs on-demand
3. **Memory Bounds** - Ring buffer for interactions (FIFO eviction)
4. **Sampling** - Configurable sampling rate for high-volume scenarios

---

## 6. ADR: SwarmObserver Enhancements

### Context

The existing SwarmObserver implementation provides core functionality but lacks some features needed for production use.

### Decision

Implement enhancements E1-E4 in priority order, maintaining backward compatibility with existing API.

### Consequences

**Positive:**

- Better interoperability with external tracing tools (E1)
- More accurate success attribution (E2)
- Better cluster detection quality (E3)
- Real-time alerting capability (E4)

**Negative:**

- Additional complexity
- Potential performance overhead for real-time callbacks

---

## 7. Implementation Checklist

### Phase 1 (P1 Enhancements)

- [ ] Add `otel-context.ts` with W3C traceparent support
- [ ] Add critical path calculation to success attribution
- [ ] Add tests for new functionality
- [ ] Update documentation

### Phase 2 (P2 Enhancements)

- [ ] Implement Louvain clustering as alternative to SCC
- [ ] Add event callback subscriptions
- [ ] Add integration tests

### Phase 3 (P3 Enhancements)

- [ ] Add OTLP export capability
- [ ] Create performance benchmarks
- [ ] Optimize hot paths based on benchmarks

---

## 8. File Structure

```
packages/nexus-agents/src/observability/
├── index.ts                    # Public exports
├── swarm-observer-types.ts     # Type definitions (existing)
├── swarm-observer.ts           # SwarmObserver class (existing)
├── interaction-graph.ts        # Directed graph (existing)
├── otel-context.ts             # W3C Trace Context (NEW)
├── critical-path.ts            # Critical path analysis (NEW)
├── louvain-clustering.ts       # Louvain algorithm (NEW)
└── __tests__/
    ├── swarm-observer.test.ts  # (existing)
    ├── interaction-graph.test.ts # (existing)
    ├── otel-context.test.ts    # (NEW)
    └── critical-path.test.ts   # (NEW)
```

---

_Document generated: 2026-01-09 (ET)_
_Aligned with: MCP Protocol 2025-11-25, CLAUDE.md coding standards_
