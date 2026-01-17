---
title: Debugging & Observability
description: Debug multi-agent workflows using SwarmObserver, EventBus, routing metrics, and correlation tracking.
---

Nexus-agents provides comprehensive observability tools for debugging multi-agent workflows, tracking interactions, and optimizing routing decisions.

## Quick Reference

```typescript
import {
  EventBus,
  getGlobalEventBus,
  generateCorrelationId,
  createChildCorrelationId,
} from 'nexus-agents/agents/collaboration/event-bus.js';

import { getSwarmObserver } from 'nexus-agents/observability/swarm-observer.js';
import { createRoutingMetricsCollector } from 'nexus-agents/observability/routing-metrics.js';
```

| Component      | Purpose                  | Key Methods                                               |
| -------------- | ------------------------ | --------------------------------------------------------- |
| EventBus       | Agent-to-agent messaging | `emit()`, `subscribe()`, `getHistory()`                   |
| SwarmObserver  | Interaction tracking     | `recordEvent()`, `getBottlenecks()`, `getHealthMetrics()` |
| RoutingMetrics | Model selection analysis | `recordDecision()`, `renderDashboard()`                   |

## CLI Debugging Tools

### routing-audit

Debug routing decisions without executing tasks:

```bash
# Basic audit
nexus-agents routing-audit "Implement a sorting algorithm"

# JSON output
nexus-agents routing-audit "Complex task" --format=json

# With bandit statistics
nexus-agents routing-audit "Code task" --bandit-stats --verbose
```

**Sample Output:**

```
Task Profile Analysis:
  - Code generation: 85%
  - Reasoning complexity: High
  - Context required: 2,500 tokens

Budget Filter Results:
  [PASS] claude - Within budget
  [PASS] gemini - Within budget
  [PASS] codex  - Within budget

TOPSIS Ranking:
  1. claude  (0.82) - Best quality/cost balance
  2. codex   (0.71) - Fast, good for code
  3. gemini  (0.68) - Large context available

LinUCB Selection:
  Selected: claude (UCB score: 0.89)
  Mode: Exploitation (learned preference)
```

### system-review

Run comprehensive system health checks:

```bash
nexus-agents system-review --verbose
```

## EventBus Debugging

The EventBus enables agent-to-agent communication and provides event history for debugging.

### Subscribing to Events

```typescript
import { EventBus, EventTopics } from 'nexus-agents/agents/collaboration/event-bus.js';

const bus = new EventBus({ maxHistorySize: 1000 });

// Subscribe to all events (debug mode)
const debugSub = bus.subscribe('*', (event) => {
  console.log(`[${event.timestamp}] ${event.topic}:`, event.payload);
});

// Subscribe to specific domain
bus.subscribe('session.*', (event) => {
  console.log('Session event:', event);
});

// Subscribe to consensus events
bus.subscribe('consensus.*', (event) => {
  console.log('Consensus:', event.payload);
});

// Clean up
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
  after: new Date(Date.now() - 60000).toISOString(),
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

## Correlation ID Tracking

Correlation IDs enable request tracing across agent boundaries.

### Generating IDs

```typescript
import {
  generateCorrelationId,
  createChildCorrelationId,
} from 'nexus-agents/agents/collaboration/event-bus.js';

// Generate root correlation ID
const rootId = generateCorrelationId();
// -> 'cor_a1b2c3d4'

// Create child IDs for subtasks
const subtask1Id = createChildCorrelationId(rootId);
// -> 'cor_a1b2c3d4.child_e5f6g7h8'

// Nested subtasks
const nestedId = createChildCorrelationId(subtask1Id);
// -> 'cor_a1b2c3d4.child_e5f6g7h8.child_m3n4o5p6'
```

### Using in Events

```typescript
import { createEvent } from 'nexus-agents/agents/collaboration/event-bus.js';

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

### Tracing Request Flow

```typescript
// Get all events for a correlation ID
const trace = bus.getHistory({ correlationId: rootId });

// Order by timestamp
const orderedTrace = trace.sort(
  (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
);

// Visualize the flow
for (const event of orderedTrace) {
  const depth = event.correlationId?.split('.child_').length ?? 0;
  const indent = '  '.repeat(depth);
  console.log(`${indent}${event.topic}: ${JSON.stringify(event.payload)}`);
}
```

## SwarmObserver

The SwarmObserver tracks agent interactions and detects swarm-level patterns.

### Setup

```typescript
import { getSwarmObserver, SwarmObserver } from 'nexus-agents/observability/swarm-observer.js';

// Get global instance
const observer = getSwarmObserver();

// Or create custom instance
const customObserver = new SwarmObserver({
  maxEvents: 10000,
  bottleneckThreshold: 5,
  minClusterSize: 3,
  cohesionThreshold: 0.4,
  metricsWindowMs: 300000, // 5 minutes
});
```

### Recording Events

```typescript
// Record agent state change
observer.recordEvent({
  eventId: SwarmObserver.generateSpanId(),
  traceId: SwarmObserver.generateTraceId(),
  agentId: 'code-expert',
  timestamp: new Date().toISOString(),
  payload: {
    type: 'state_change',
    newState: 'thinking',
  },
});

// Record tool usage
observer.recordEvent({
  eventId: SwarmObserver.generateSpanId(),
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

### Recording Interactions

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

### Identifying Clusters

```typescript
const clusters = observer.getEmergentClusters();

for (const cluster of clusters) {
  console.log(`Cluster ${cluster.clusterId}:`);
  console.log(`  - Agents: ${cluster.agents.join(', ')}`);
  console.log(`  - Cohesion: ${cluster.cohesion.toFixed(2)}`);
  console.log(`  - Internal interactions: ${cluster.internalInteractions}`);
  console.log(`  - Dominant pattern: ${cluster.dominantPattern ?? 'none'}`);
}
```

### Health Metrics

```typescript
const health = observer.getHealthMetrics();

console.log('Swarm Health:');
console.log(`  Total agents: ${health.totalAgents}`);
console.log(`  Active agents: ${health.activeAgents}`);
console.log(`  Error agents: ${health.errorAgents}`);
console.log(`  Total interactions: ${health.totalInteractions}`);
console.log(`  Success rate: ${(health.successRate * 100).toFixed(1)}%`);
console.log(`  Avg latency: ${health.avgLatencyMs.toFixed(0)}ms`);
console.log(`  Bottlenecks: ${health.bottlenecks.length}`);
```

## Byzantine Detection

Monitor for Byzantine (adversarial) behavior patterns.

### Subscribe to Byzantine Events

```typescript
// Weight changes
bus.subscribe(EventTopics.BYZANTINE_WEIGHT_UPDATED, (event) => {
  const { agentId, previousWeight, newWeight, reason } = event.payload;
  console.log(`Agent ${agentId} weight: ${previousWeight.toFixed(2)} -> ${newWeight.toFixed(2)}`);
});

// Pattern detection
bus.subscribe(EventTopics.BYZANTINE_PATTERN_DETECTED, (event) => {
  const { patternType, agentIds, confidence, details } = event.payload;
  console.warn(`Byzantine pattern: ${patternType}`);
  console.warn(`  Agents: ${agentIds.join(', ')}`);
  console.warn(`  Confidence: ${(confidence * 100).toFixed(0)}%`);
});

// Agent flagging
bus.subscribe(EventTopics.BYZANTINE_AGENT_FLAGGED, (event) => {
  const { agentId, reason, canVote } = event.payload;
  console.error(`Agent ${agentId} flagged: ${reason}`);
});

// Collusion detection
bus.subscribe(EventTopics.BYZANTINE_COLLUSION_SUSPECTED, (event) => {
  const { groupAgentIds, votingBlock, threshold } = event.payload;
  console.error(`Collusion suspected: ${groupAgentIds.join(', ')}`);
});
```

## Routing Metrics

Track model selection patterns and effectiveness.

### Recording Decisions

```typescript
import { createRoutingMetricsCollector } from 'nexus-agents/observability/routing-metrics.js';

const metrics = createRoutingMetricsCollector({
  maxRecords: 10000,
  retentionHours: 168,
});

// Record decision
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

### ASCII Dashboard

```typescript
console.log(
  metrics.renderDashboard({
    width: 70,
    showTrends: true,
    periodHours: 24,
  })
);
```

**Output:**

```
+--------------------------------------------------------------------+
|       Routing Effectiveness Dashboard (last 24h)                   |
+--------------------------------------------------------------------+
| Model Selection Distribution:                                       |
|   claude  ████████████░░░░░░░░ 60% (avg reward: 0.82)              |
|   gemini  ██████░░░░░░░░░░░░░░ 30% (avg reward: 0.78)              |
|   codex   ██░░░░░░░░░░░░░░░░░░ 10% (avg reward: 0.75)              |
+--------------------------------------------------------------------+
| Learning Progress:                                                  |
|   Exploration rate: 15% (healthy)                                   |
|   Avg reward trend: +0.05 vs last period                           |
+--------------------------------------------------------------------+
| Performance:                                                        |
|   Routing decisions: 1,234                                          |
|   Task success rate: 85%                                            |
+--------------------------------------------------------------------+
```

### JSON Export

```typescript
const jsonMetrics = metrics.toJSON(24);
const data = JSON.parse(jsonMetrics);

console.log(`Exploration rate: ${(data.explorationRate * 100).toFixed(1)}%`);
console.log(`Average reward: ${data.avgReward.toFixed(2)}`);
```

## Common Debugging Scenarios

### Request Never Completes

```typescript
// 1. Check event history for the correlation ID
const trace = bus.getHistory({ correlationId: requestCorrelationId });
const lastEvent = trace[trace.length - 1];
console.log('Last event:', lastEvent?.topic, lastEvent?.timestamp);

// 2. Check for bottlenecks
const bottlenecks = observer.getBottlenecks();
if (bottlenecks.length > 0) {
  console.log('Bottleneck at:', bottlenecks[0].agentId);
}

// 3. Check agent states
const health = observer.getHealthMetrics();
console.log('Error agents:', health.errorAgents);
```

### Poor Task Quality

```typescript
// 1. Check routing decisions
const metrics = metricsCollector.getMetrics(24);
for (const model of metrics.modelMetrics) {
  if (model.successRate < 0.7) {
    console.log(`${model.model} has low success rate: ${model.successRate}`);
  }
}

// 2. Check for Byzantine patterns
const byzantineEvents = bus.getHistory({ topic: 'byzantine.*' });
if (byzantineEvents.length > 0) {
  console.log('Byzantine events detected:', byzantineEvents.length);
}
```

### Consensus Failures

```typescript
// 1. Subscribe to consensus events
bus.subscribe('consensus.*', (event) => {
  console.log(event.topic, event.payload);
});

// 2. Check weighted voting records
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

### High Latency

```typescript
// 1. Check routing latency
const metrics = metricsCollector.getMetrics(1);
for (const model of metrics.modelMetrics) {
  console.log(`${model.model}: ${model.avgLatencyMs}ms`);
}

// 2. Check interaction graph for slow paths
const graph = observer.getCollaborationGraph();
const edges = graph.getEdges();
const slowEdges = edges.filter((e) => (e.durationMs ?? 0) > 5000);
console.log('Slow interactions:', slowEdges);
```

## Best Practices

1. **Always use correlation IDs** - Generate at request boundaries, propagate to all subtasks
2. **Subscribe to Byzantine events in production** - Early warning for agent misbehavior
3. **Review routing dashboard weekly** - Check exploration rate stays between 10-20%
4. **Set up bottleneck alerts** - Use `getBottlenecks()` in health checks
5. **Clear history periodically** - Prevent memory growth in long-running processes

## Next Steps

- [CLI Commands](/guides/cli-usage) - Use debugging commands
- [Agent Development](/development/agent-development) - Build observable agents
- [Architecture Overview](/reference/architecture) - System design details
