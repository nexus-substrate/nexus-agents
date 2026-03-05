---
title: 'Debugging with Observability'
description: 'Debug multi-agent workflows using EventBus, correlation IDs, and OrchestrationObserver (formerly SwarmObserver)'
tier: 2
keywords:
  - debugging
  - observability
  - eventbus
  - tracing
related_files:
  - src/pipeline/event-bus.ts
  - src/mcp/tools/index.ts
---

# Debugging with Observability

**Version:** 1.0.0
**Last Updated:** 2026-01-12 (ET)
**Sprint:** #228 (A2A Observability Completion)

This guide covers debugging multi-agent workflows using the nexus-agents observability infrastructure.

---

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [EventBus Debugging](#eventbus-debugging)
3. [Correlation ID Tracking](#correlation-id-tracking)
4. [OrchestrationObserver](#orchestrationobserver)
5. [Byzantine Detection](#byzantine-detection)
6. [Routing Metrics](#routing-metrics)
7. [Common Debugging Scenarios](#common-debugging-scenarios)

---

## Quick Reference

```typescript
import {
  EventBus,
  getGlobalEventBus,
  generateCorrelationId,
  createChildCorrelationId,
} from 'nexus-agents/agents/collaboration/event-bus.js';
import { getOrchestrationObserver } from 'nexus-agents/observability/orchestration-observer.js';
import { createRoutingMetricsCollector } from 'nexus-agents/observability/routing-metrics.js';
```

| Component             | Purpose                  | Key Methods                                               |
| --------------------- | ------------------------ | --------------------------------------------------------- |
| EventBus              | Agent-to-agent messaging | `emit()`, `subscribe()`, `getHistory()`                   |
| OrchestrationObserver | Interaction tracking     | `recordEvent()`, `getBottlenecks()`, `getHealthMetrics()` |
| RoutingMetrics        | Model selection analysis | `recordDecision()`, `renderDashboard()`                   |

---

## EventBus Debugging

### Subscribing to Debug Events

```typescript
import { EventBus, EventTopics } from 'nexus-agents/agents/collaboration/event-bus.js';

const bus = new EventBus({ maxHistorySize: 1000 });

// Subscribe to all events (debug mode)
const debugSub = bus.subscribe('*', (event) => {
  console.log(`[${event.timestamp}] ${event.topic}:`, event.payload);
});

// Subscribe to specific domain
const sessionSub = bus.subscribe('session.*', (event) => {
  console.log('Session event:', event);
});

// Subscribe to consensus events
const consensusSub = bus.subscribe('consensus.*', (event) => {
  console.log('Consensus:', event.payload);
});

// Clean up when done
debugSub.unsubscribe();
```

### Querying Event History

```typescript
// Get all events
const allEvents = bus.getHistory();

// Filter by topic pattern
const sessionEvents = bus.getHistory({ topic: 'session.*' });

// Filter by correlation ID (trace a request)
const requestTrace = bus.getHistory({
  correlationId: 'cor_a1b2c3d4',
});

// Filter by time window
const recentEvents = bus.getHistory({
  after: new Date(Date.now() - 60000).toISOString(), // Last minute
  limit: 100,
});

// Combined filters
const specificTrace = bus.getHistory({
  topic: 'consensus.*',
  correlationId: 'cor_a1b2c3d4',
  sessionId: 'session-123',
});
```

### Event Topics Reference

| Topic Pattern          | Events                                                                   |
| ---------------------- | ------------------------------------------------------------------------ |
| `session.*`            | created, status_changed, participant_joined, result_submitted, finalized |
| `message.*`            | sent, received                                                           |
| `agent.*`              | task_delegated, result_broadcast                                         |
| `consensus.*`          | vote_requested, vote_cast, reached                                       |
| `protocol.*`           | started, iteration, completed                                            |
| `protocol.aegean.*`    | round_started, vote_collected, quorum_detected                           |
| `protocol.reflexion.*` | critique_started, critique_completed, synthesis                          |
| `protocol.trinity.*`   | phase_started, phase_completed                                           |
| `byzantine.*`          | weight_updated, pattern_detected, agent_flagged, collusion_suspected     |

---

## Correlation ID Tracking

Correlation IDs enable request tracing across agent boundaries.

### Generating Correlation IDs

```typescript
import {
  generateCorrelationId,
  createChildCorrelationId,
} from 'nexus-agents/agents/collaboration/event-bus.js';

// Generate root correlation ID for a request
const rootId = generateCorrelationId();
// -> 'cor_a1b2c3d4'

// Create child IDs for subtasks
const subtask1Id = createChildCorrelationId(rootId);
// -> 'cor_a1b2c3d4.child_e5f6g7h8'

const subtask2Id = createChildCorrelationId(rootId);
// -> 'cor_a1b2c3d4.child_i9j0k1l2'

// Nested subtasks
const nestedId = createChildCorrelationId(subtask1Id);
// -> 'cor_a1b2c3d4.child_e5f6g7h8.child_m3n4o5p6'
```

### Using Correlation IDs in Events

```typescript
import { createEvent } from 'nexus-agents/agents/collaboration/event-bus.js';

// Create event with correlation ID
const event = createEvent(
  'agent.task_delegated',
  {
    fromAgent: 'tech-lead',
    toAgent: 'code-expert',
    taskDescription: 'Review authentication module',
    priority: 'high',
  },
  {
    sessionId: 'session-123',
    correlationId: rootId,
  }
);

bus.emit(event);
```

### Tracing a Request Flow

```typescript
// 1. Start with the root correlation ID
const trace = bus.getHistory({ correlationId: rootId });

// 2. Order by timestamp
const orderedTrace = trace.sort(
  (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
);

// 3. Visualize the flow
for (const event of orderedTrace) {
  const depth = event.correlationId?.split('.child_').length ?? 0;
  const indent = '  '.repeat(depth);
  console.log(`${indent}${event.topic}: ${JSON.stringify(event.payload)}`);
}
```

---

## OrchestrationObserver

The OrchestrationObserver tracks agent interactions and detects orchestration-level patterns.

### Basic Setup

```typescript
import {
  getOrchestrationObserver,
  OrchestrationObserver,
} from 'nexus-agents/observability/orchestration-observer.js';

// Get global instance
const observer = getOrchestrationObserver();

// Or create custom instance
const customObserver = new OrchestrationObserver({
  maxEvents: 10000,
  bottleneckThreshold: 5,
  minClusterSize: 3,
  cohesionThreshold: 0.4,
  metricsWindowMs: 300000, // 5 minutes
});
```

### Recording Agent Events

```typescript
// Record agent state change
observer.recordEvent({
  eventId: OrchestrationObserver.generateSpanId(),
  traceId: OrchestrationObserver.generateTraceId(),
  agentId: 'code-expert',
  timestamp: new Date().toISOString(),
  payload: {
    type: 'state_change',
    newState: 'thinking',
  },
});

// Record message event
observer.recordEvent({
  eventId: OrchestrationObserver.generateSpanId(),
  traceId,
  agentId: 'code-expert',
  timestamp: new Date().toISOString(),
  payload: {
    type: 'message',
    direction: 'received',
    fromAgent: 'tech-lead',
    content: 'Review this PR',
  },
});

// Record tool usage
observer.recordEvent({
  eventId: OrchestrationObserver.generateSpanId(),
  traceId,
  agentId: 'code-expert',
  timestamp: new Date().toISOString(),
  durationMs: 1234,
  payload: {
    type: 'tool',
    toolName: 'read_file',
    phase: 'completed',
    success: true,
  },
});
```

### Recording Agent Interactions

```typescript
// Record delegation
observer.recordInteraction({
  from: 'tech-lead',
  to: 'code-expert',
  interactionType: 'delegation',
  outcome: 'success',
  traceId,
  durationMs: 50,
});

// Record response
observer.recordInteraction({
  from: 'code-expert',
  to: 'tech-lead',
  interactionType: 'response',
  outcome: 'success',
  traceId,
  durationMs: 5000,
});
```

### Detecting Bottlenecks

```typescript
const bottlenecks = observer.getBottlenecks();

for (const bottleneck of bottlenecks) {
  console.log(`Agent ${bottleneck.agentId} is a bottleneck:`);
  console.log(`  - Queued messages: ${bottleneck.queuedMessages}`);
  console.log(`  - Avg wait time: ${bottleneck.avgWaitTimeMs}ms`);
  console.log(`  - Blocked agents: ${bottleneck.blockedAgents}`);
  console.log(`  - Severity: ${bottleneck.severity}`);
}
```

### Identifying Emergent Clusters

```typescript
const clusters = observer.getEmergentClusters();

for (const cluster of clusters) {
  console.log(`Cluster ${cluster.clusterId}:`);
  console.log(`  - Agents: ${cluster.agents.join(', ')}`);
  console.log(`  - Cohesion: ${cluster.cohesion.toFixed(2)}`);
  console.log(`  - Internal interactions: ${cluster.internalInteractions}`);
  console.log(`  - External interactions: ${cluster.externalInteractions}`);
  console.log(`  - Dominant pattern: ${cluster.dominantPattern ?? 'none'}`);
}
```

### Getting Health Metrics

```typescript
const health = observer.getHealthMetrics();

console.log('Orchestration Health:');
console.log(`  Total agents: ${health.totalAgents}`);
console.log(`  Active agents: ${health.activeAgents}`);
console.log(`  Error agents: ${health.errorAgents}`);
console.log(`  Total interactions: ${health.totalInteractions}`);
console.log(`  Success rate: ${(health.successRate * 100).toFixed(1)}%`);
console.log(`  Avg latency: ${health.avgLatencyMs.toFixed(0)}ms`);
console.log(`  Bottlenecks: ${health.bottlenecks.length}`);
console.log(`  Clusters: ${health.clusters.length}`);
```

### Success Attribution

```typescript
// Register agents for a task
observer.registerAgentForTask('task-123', 'tech-lead');
observer.registerAgentForTask('task-123', 'code-expert');
observer.registerAgentForTask('task-123', 'security-expert');

// ... task execution with recorded events ...

// Attribute success
const contributions = observer.attributeSuccess('task-123');

for (const [agentId, score] of contributions) {
  console.log(`${agentId}: ${(score.score * 100).toFixed(1)}%`);
  console.log(`  - Messages sent: ${score.messagesSent}`);
  console.log(`  - Successful tools: ${score.successfulTools}`);
  console.log(`  - Errors: ${score.errorCount}`);
}
```

---

## Byzantine Detection

The weighted voting system emits events when Byzantine patterns are detected.

### Subscribing to Byzantine Events

```typescript
import { EventBus, EventTopics } from 'nexus-agents/agents/collaboration/event-bus.js';

const bus = new EventBus();

// Weight changes
bus.subscribe(EventTopics.BYZANTINE_WEIGHT_UPDATED, (event) => {
  const { agentId, previousWeight, newWeight, reason } = event.payload;
  console.log(
    `Agent ${agentId} weight: ${previousWeight.toFixed(2)} -> ${newWeight.toFixed(2)} (${reason})`
  );
});

// Pattern detection
bus.subscribe(EventTopics.BYZANTINE_PATTERN_DETECTED, (event) => {
  const { patternType, agentIds, confidence, details } = event.payload;
  console.warn(`Byzantine pattern detected: ${patternType}`);
  console.warn(`  Agents: ${agentIds.join(', ')}`);
  console.warn(`  Confidence: ${(confidence * 100).toFixed(0)}%`);
  console.warn(`  Details: ${details}`);
});

// Agent flagging
bus.subscribe(EventTopics.BYZANTINE_AGENT_FLAGGED, (event) => {
  const { agentId, reason, canVote } = event.payload;
  console.error(`Agent ${agentId} flagged: ${reason}`);
  console.error(`  Can still vote: ${canVote}`);
});

// Collusion detection
bus.subscribe(EventTopics.BYZANTINE_COLLUSION_SUSPECTED, (event) => {
  const { groupAgentIds, votingBlock, threshold } = event.payload;
  console.error(`Collusion suspected among: ${groupAgentIds.join(', ')}`);
  console.error(`  Voting block: ${(votingBlock * 100).toFixed(0)}%`);
  console.error(`  Threshold: ${(threshold * 100).toFixed(0)}%`);
});
```

### Using WeightedVoting with EventBus

```typescript
import { createWeightedVoting } from 'nexus-agents/consensus/weighted-voting.js';
import { EventBus } from 'nexus-agents/agents/collaboration/event-bus.js';

const eventBus = new EventBus();
const voting = createWeightedVoting({
  eventBus,
  config: {
    initialWeight: 0.5,
    quorumThreshold: 0.67,
    byzantineFlagThreshold: 3,
  },
});

// Register agents
voting.registerAgent('agent-1');
voting.registerAgent('agent-2');
voting.registerAgent('agent-3');

// Update performance (emits weight_updated events)
voting.updatePerformance('agent-1', 'success');
voting.updatePerformance('agent-2', 'failure');

// Run consensus (may emit pattern_detected, collusion_suspected)
const votes = new Map([
  ['agent-1', { decision: 'approve', confidence: 0.9 }],
  ['agent-2', { decision: 'reject', confidence: 0.2 }],
  ['agent-3', { decision: 'approve', confidence: 0.8 }],
]);

const result = voting.weightedConsensus(votes);
console.log(`Decision: ${result.decision}`);
console.log(`Byzantine detected: ${result.byzantineDetected}`);
```

---

## Routing Metrics

The routing metrics collector tracks model selection patterns.

### Recording Routing Decisions

```typescript
import { createRoutingMetricsCollector } from 'nexus-agents/observability/routing-metrics.js';

const metrics = createRoutingMetricsCollector({
  maxRecords: 10000,
  retentionHours: 168, // 1 week
});

// Record a routing decision
metrics.recordDecision({
  timestamp: new Date().toISOString(),
  traceId: 'trace-123',
  selectedModel: 'claude',
  alternativeModels: ['gemini', 'codex'],
  isExploration: false,
  taskType: 'code_generation',
  contextTokens: 5000,
});

// Record outcome
metrics.recordOutcome({
  timestamp: new Date().toISOString(),
  traceId: 'trace-123',
  model: 'claude',
  success: true,
  reward: 0.85,
  qualityScore: 0.9,
  latencyMs: 2500,
});
```

### Viewing the Dashboard

```typescript
// Render ASCII dashboard
console.log(
  metrics.renderDashboard({
    width: 70,
    showTrends: true,
    periodHours: 24,
  })
);

// Output:
// ╭────────────────────────────────────────────────────────────────────╮
// │       Routing Effectiveness Dashboard (last 24h)                  │
// ├────────────────────────────────────────────────────────────────────┤
// │ Model Selection Distribution:                                      │
// │   claude  ████████████░░░░░░░░ 60% (avg reward: 0.82)             │
// │   gemini  ██████░░░░░░░░░░░░░░ 30% (avg reward: 0.78)             │
// │   codex   ██░░░░░░░░░░░░░░░░░░ 10% (avg reward: 0.75)             │
// ├────────────────────────────────────────────────────────────────────┤
// │ Learning Progress:                                                 │
// │   Exploration rate: 15% (healthy)                                  │
// │   Avg reward trend: ↑ +0.05 vs last period                        │
// │   Avg reward: 0.80                                                 │
// ├────────────────────────────────────────────────────────────────────┤
// │ Performance:                                                       │
// │   Routing decisions: 1,234                                         │
// │   Task outcomes: 1,180                                             │
// │   Avg routing latency: 8ms                                         │
// │   Task success rate: 85%                                           │
// ╰────────────────────────────────────────────────────────────────────╯
```

### Getting Metrics as JSON

```typescript
const jsonMetrics = metrics.toJSON(24);
console.log(jsonMetrics);

// Parse and analyze
const data = JSON.parse(jsonMetrics);
console.log(`Exploration rate: ${(data.explorationRate * 100).toFixed(1)}%`);
console.log(`Average reward: ${data.avgReward.toFixed(2)}`);
```

---

## Common Debugging Scenarios

### Scenario 1: Request Never Completes

1. Check EventBus history for the correlation ID:

   ```typescript
   const trace = bus.getHistory({ correlationId: requestCorrelationId });
   const lastEvent = trace[trace.length - 1];
   console.log('Last event:', lastEvent?.topic, lastEvent?.timestamp);
   ```

2. Check for bottlenecks:

   ```typescript
   const bottlenecks = observer.getBottlenecks();
   if (bottlenecks.length > 0) {
     console.log('Bottleneck at:', bottlenecks[0].agentId);
   }
   ```

3. Check agent states:
   ```typescript
   const health = observer.getHealthMetrics();
   console.log('Error agents:', health.errorAgents);
   ```

### Scenario 2: Poor Task Quality

1. Check routing decisions:

   ```typescript
   const metrics = metricsCollector.getMetrics(24);
   for (const model of metrics.modelMetrics) {
     if (model.successRate < 0.7) {
       console.log(`${model.model} has low success rate: ${model.successRate}`);
     }
   }
   ```

2. Check for Byzantine patterns:
   ```typescript
   const byzantineEvents = bus.getHistory({ topic: 'byzantine.*' });
   if (byzantineEvents.length > 0) {
     console.log('Byzantine events detected:', byzantineEvents.length);
   }
   ```

### Scenario 3: Consensus Failures

1. Subscribe to consensus events:

   ```typescript
   bus.subscribe('consensus.*', (event) => {
     console.log(event.topic, event.payload);
   });
   ```

2. Check weighted voting records:
   ```typescript
   const records = voting.getAllRecords();
   for (const record of records) {
     if (!voting.canVote(record.agentId)) {
       console.log(`${record.agentId} cannot vote:`, {
         weight: record.weight,
         trustScore: record.trustScore,
         byzantineFlags: record.byzantineFlags,
       });
     }
   }
   ```

### Scenario 4: High Latency

1. Check routing latency:

   ```typescript
   const metrics = metricsCollector.getMetrics(1); // Last hour
   for (const model of metrics.modelMetrics) {
     console.log(`${model.model}: ${model.avgLatencyMs}ms`);
   }
   ```

2. Check interaction graph for long paths:
   ```typescript
   const graph = observer.getCollaborationGraph();
   const edges = graph.getEdges();
   const slowEdges = edges.filter((e) => (e.durationMs ?? 0) > 5000);
   console.log('Slow interactions:', slowEdges);
   ```

---

## Best Practices

1. **Always use correlation IDs** - Generate at request boundaries, propagate to all subtasks
2. **Subscribe to Byzantine events in production** - Early warning for agent misbehavior
3. **Review routing dashboard weekly** - Check exploration rate stays between 10-20%
4. **Set up bottleneck alerts** - Use `getBottlenecks()` in health checks
5. **Clear history periodically** - Prevent memory growth in long-running processes

---

## Related Documentation

- [SWARM_OBSERVER_DESIGN.md](../architecture/SWARM_OBSERVER_DESIGN.md) - Architecture design
- [ARCHITECTURE.md](../../ARCHITECTURE.md) - System architecture
- [event-bus-types.ts](../../packages/nexus-agents/src/agents/collaboration/event-bus-types.ts) - Event type definitions

---

_Last updated: 2026-01-12 (ET)_
