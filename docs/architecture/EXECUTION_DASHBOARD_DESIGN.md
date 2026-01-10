# Execution Dashboard Architecture Design

**Author:** System Architecture Designer
**Date:** 2026-01-09 (ET)
**Status:** Proposal
**Issue:** TBD
**Related:** SwarmObserver (`packages/nexus-agents/src/observability/`)

---

## 1. Overview

This document specifies the architecture for a terminal-based Execution Dashboard that visualizes SwarmObserver data in real-time. The dashboard operates in a terminal/MCP context without requiring a browser, providing operators with visibility into multi-agent swarm behavior.

### 1.1 Requirements

| ID  | Requirement                          | Priority |
| --- | ------------------------------------ | -------- |
| R1  | Subscribe to SwarmObserver events    | P1       |
| R2  | Display health metrics in real-time  | P1       |
| R3  | Show bottleneck alerts               | P1       |
| R4  | Visualize agent clusters             | P2       |
| R5  | Output JSON for MCP tool integration | P1       |
| R6  | Output formatted text for CLI        | P2       |
| R7  | Support historical snapshots         | P3       |
| R8  | Minimal memory footprint (< 50MB)    | P2       |

### 1.2 Non-Requirements

- Browser-based UI (explicitly excluded)
- Persistent storage (use external tools if needed)
- Remote monitoring (single-process only)
- Real-time streaming over network

---

## 2. Architecture

### 2.1 Component Overview

```
+-------------------+       +----------------------+       +------------------+
|   SwarmObserver   | ----> | DashboardSubscriber  | ----> |  OutputRenderer  |
| (existing)        |       | (event aggregation)  |       |  (format output) |
+-------------------+       +----------------------+       +------------------+
        |                            |                              |
        v                            v                              v
  Records events             Aggregates metrics             JSON / Text / Table
  Records interactions       Detects anomalies              to stdout or MCP
```

### 2.2 Data Flow

1. **Event Recording** - SwarmObserver records agent events and interactions
2. **Subscription** - DashboardSubscriber polls or subscribes to SwarmObserver
3. **Aggregation** - Metrics are aggregated into dashboard views
4. **Rendering** - OutputRenderer formats data for the target output

### 2.3 Integration Pattern

The dashboard does NOT modify the existing SwarmObserver. It reads data through the public `ISwarmObserver` interface:

```typescript
// SwarmObserver provides these read methods:
interface ISwarmObserver {
  getHealthMetrics(): SwarmHealthMetrics;
  getBottlenecks(): BottleneckInfo[];
  getEmergentClusters(): AgentCluster[];
  getCollaborationGraph(): InteractionGraph;
  getEventsByTrace(traceId: TraceId): AgentEvent[];
  getEventsByAgent(agentId: AgentId): AgentEvent[];
  attributeSuccess(taskId: TaskId): Map<AgentId, ContributionScore>;
}
```

---

## 3. File Structure

```
packages/nexus-agents/src/observability/dashboard/
├── index.ts                      # Public exports
├── dashboard-types.ts            # Type definitions
├── dashboard-subscriber.ts       # Event subscription/polling
├── dashboard-aggregator.ts       # Metric aggregation logic
├── renderers/
│   ├── index.ts                  # Renderer exports
│   ├── json-renderer.ts          # JSON output format
│   ├── text-renderer.ts          # Plain text format
│   └── table-renderer.ts         # ASCII table format
└── __tests__/
    ├── dashboard-subscriber.test.ts
    ├── dashboard-aggregator.test.ts
    └── renderers.test.ts
```

---

## 4. Type Definitions

### 4.1 Core Dashboard Types

```typescript
// dashboard-types.ts

import type {
  SwarmHealthMetrics,
  BottleneckInfo,
  AgentCluster,
  AgentId,
  InteractionEdge,
} from '../swarm-observer-types.js';

/**
 * Output format for dashboard rendering.
 */
export type OutputFormat = 'json' | 'text' | 'table';

/**
 * Dashboard configuration.
 */
export interface DashboardConfig {
  /** Polling interval in milliseconds (default: 1000) */
  readonly pollIntervalMs: number;
  /** Output format */
  readonly format: OutputFormat;
  /** Maximum history entries to retain */
  readonly maxHistory: number;
  /** Enable color output (for text/table formats) */
  readonly useColors: boolean;
  /** Bottleneck severity threshold for alerts */
  readonly alertSeverity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Dashboard snapshot at a point in time.
 */
export interface DashboardSnapshot {
  /** ISO timestamp */
  readonly timestamp: string;
  /** Overall swarm health */
  readonly health: SwarmHealthMetrics;
  /** Active bottlenecks above alert threshold */
  readonly alerts: BottleneckAlert[];
  /** Agent interaction summary */
  readonly interactions: InteractionSummary;
  /** Cluster visualization data */
  readonly clusters: ClusterView[];
  /** Top agents by activity */
  readonly topAgents: AgentActivitySummary[];
}

/**
 * Bottleneck alert with context.
 */
export interface BottleneckAlert {
  readonly bottleneck: BottleneckInfo;
  readonly detectedAt: string;
  readonly duration: number;
  readonly trend: 'improving' | 'stable' | 'worsening';
}

/**
 * Summary of interaction patterns.
 */
export interface InteractionSummary {
  readonly totalEdges: number;
  readonly successfulEdges: number;
  readonly failedEdges: number;
  readonly pendingEdges: number;
  readonly avgLatencyMs: number;
  readonly p99LatencyMs: number;
  readonly throughputPerSecond: number;
}

/**
 * Cluster visualization data.
 */
export interface ClusterView {
  readonly clusterId: string;
  readonly agents: AgentId[];
  readonly cohesion: number;
  readonly dominantPattern: string | undefined;
  /** Simple ASCII visualization */
  readonly diagram: string;
}

/**
 * Agent activity summary for leaderboard.
 */
export interface AgentActivitySummary {
  readonly agentId: AgentId;
  readonly messagesSent: number;
  readonly messagesReceived: number;
  readonly successRate: number;
  readonly avgLatencyMs: number;
  readonly state: 'idle' | 'active' | 'blocked' | 'error';
}
```

### 4.2 Subscriber Interface

```typescript
/**
 * Interface for dashboard event subscription.
 */
export interface IDashboardSubscriber {
  /**
   * Start polling/subscribing to SwarmObserver.
   */
  start(): void;

  /**
   * Stop polling/subscribing.
   */
  stop(): void;

  /**
   * Get the latest snapshot.
   */
  getSnapshot(): DashboardSnapshot;

  /**
   * Get historical snapshots.
   */
  getHistory(count: number): DashboardSnapshot[];

  /**
   * Register callback for new snapshots.
   */
  onSnapshot(callback: (snapshot: DashboardSnapshot) => void): () => void;

  /**
   * Register callback for alerts.
   */
  onAlert(callback: (alert: BottleneckAlert) => void): () => void;
}
```

### 4.3 Renderer Interface

```typescript
/**
 * Interface for output rendering.
 */
export interface IOutputRenderer {
  /**
   * Render a snapshot to string output.
   */
  render(snapshot: DashboardSnapshot): string;

  /**
   * Render a single alert.
   */
  renderAlert(alert: BottleneckAlert): string;

  /**
   * Render health summary only.
   */
  renderHealth(health: SwarmHealthMetrics): string;
}
```

---

## 5. Component Design

### 5.1 DashboardSubscriber

The subscriber polls the SwarmObserver at a configurable interval and aggregates data into snapshots.

```typescript
// dashboard-subscriber.ts

import type { ISwarmObserver, SwarmHealthMetrics } from '../swarm-observer-types.js';
import type {
  IDashboardSubscriber,
  DashboardSnapshot,
  BottleneckAlert,
  DashboardConfig,
} from './dashboard-types.js';

/**
 * Default configuration.
 */
export const DEFAULT_DASHBOARD_CONFIG: DashboardConfig = {
  pollIntervalMs: 1000,
  format: 'json',
  maxHistory: 100,
  useColors: true,
  alertSeverity: 'medium',
};

/**
 * Dashboard subscriber implementation.
 */
export class DashboardSubscriber implements IDashboardSubscriber {
  private readonly observer: ISwarmObserver;
  private readonly config: DashboardConfig;
  private readonly history: DashboardSnapshot[] = [];
  private readonly snapshotListeners: Set<(s: DashboardSnapshot) => void> = new Set();
  private readonly alertListeners: Set<(a: BottleneckAlert) => void> = new Set();
  private intervalId: ReturnType<typeof setInterval> | undefined;
  private previousBottlenecks: Map<string, BottleneckAlert> = new Map();

  constructor(observer: ISwarmObserver, config?: Partial<DashboardConfig>) {
    this.observer = observer;
    this.config = { ...DEFAULT_DASHBOARD_CONFIG, ...config };
  }

  start(): void {
    if (this.intervalId) return;
    this.intervalId = setInterval(() => this.poll(), this.config.pollIntervalMs);
    this.poll(); // Immediate first poll
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
  }

  getSnapshot(): DashboardSnapshot {
    return this.history[this.history.length - 1] ?? this.createEmptySnapshot();
  }

  getHistory(count: number): DashboardSnapshot[] {
    return this.history.slice(-count);
  }

  onSnapshot(callback: (snapshot: DashboardSnapshot) => void): () => void {
    this.snapshotListeners.add(callback);
    return () => this.snapshotListeners.delete(callback);
  }

  onAlert(callback: (alert: BottleneckAlert) => void): () => void {
    this.alertListeners.add(callback);
    return () => this.alertListeners.delete(callback);
  }

  private poll(): void {
    const snapshot = this.buildSnapshot();
    this.addToHistory(snapshot);
    this.emitSnapshot(snapshot);
    this.checkAlerts(snapshot);
  }

  private buildSnapshot(): DashboardSnapshot {
    const health = this.observer.getHealthMetrics();
    const bottlenecks = this.observer.getBottlenecks();
    const clusters = this.observer.getEmergentClusters();
    const graph = this.observer.getCollaborationGraph();

    return {
      timestamp: new Date().toISOString(),
      health,
      alerts: this.buildAlerts(bottlenecks),
      interactions: this.buildInteractionSummary(graph),
      clusters: this.buildClusterViews(clusters),
      topAgents: this.buildTopAgents(graph, health),
    };
  }

  // ... implementation details
}
```

### 5.2 DashboardAggregator

Computes derived metrics from raw SwarmObserver data.

```typescript
// dashboard-aggregator.ts

import type { InteractionGraph, InteractionEdge, AgentId } from '../swarm-observer-types.js';
import type { InteractionSummary, AgentActivitySummary } from './dashboard-types.js';

/**
 * Compute interaction summary from graph.
 */
export function computeInteractionSummary(
  graph: InteractionGraph,
  windowMs: number
): InteractionSummary {
  const edges = graph.getEdges();
  const windowStart = Date.now() - windowMs;
  const recentEdges = edges.filter((e) => new Date(e.timestamp).getTime() >= windowStart);

  const successful = recentEdges.filter((e) => e.outcome === 'success').length;
  const failed = recentEdges.filter((e) => e.outcome === 'failure').length;
  const pending = recentEdges.filter((e) => e.outcome === 'pending').length;

  const latencies = recentEdges
    .filter((e) => e.durationMs !== undefined)
    .map((e) => e.durationMs as number)
    .sort((a, b) => a - b);

  const avgLatency =
    latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

  const p99Index = Math.floor(latencies.length * 0.99);
  const p99Latency = latencies[p99Index] ?? 0;

  const windowSeconds = windowMs / 1000;
  const throughput = recentEdges.length / windowSeconds;

  return {
    totalEdges: recentEdges.length,
    successfulEdges: successful,
    failedEdges: failed,
    pendingEdges: pending,
    avgLatencyMs: avgLatency,
    p99LatencyMs: p99Latency,
    throughputPerSecond: throughput,
  };
}

/**
 * Rank agents by activity level.
 */
export function rankAgentsByActivity(
  graph: InteractionGraph,
  limit: number
): AgentActivitySummary[] {
  const nodes = graph.getNodes();
  const summaries: AgentActivitySummary[] = [];

  for (const agentId of nodes) {
    const outgoing = graph.getOutgoingEdges(agentId);
    const incoming = graph.getIncomingEdges(agentId);

    const successfulOut = outgoing.filter((e) => e.outcome === 'success').length;
    const totalOut = outgoing.length || 1;

    const latencies = [...outgoing, ...incoming]
      .filter((e) => e.durationMs !== undefined)
      .map((e) => e.durationMs as number);

    const avgLatency =
      latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;

    summaries.push({
      agentId,
      messagesSent: outgoing.length,
      messagesReceived: incoming.length,
      successRate: successfulOut / totalOut,
      avgLatencyMs: avgLatency,
      state: 'active', // Would need agent state tracking for accuracy
    });
  }

  return summaries
    .sort((a, b) => b.messagesSent + b.messagesReceived - (a.messagesSent + a.messagesReceived))
    .slice(0, limit);
}

/**
 * Generate ASCII diagram for cluster.
 */
export function generateClusterDiagram(agents: AgentId[], maxWidth: number = 40): string {
  if (agents.length === 0) return '(empty)';
  if (agents.length === 1) return `[${truncate(agents[0], 20)}]`;

  // Simple circular layout representation
  const lines: string[] = [];
  const displayAgents = agents.slice(0, 8); // Limit for readability

  lines.push('+' + '-'.repeat(maxWidth - 2) + '+');
  lines.push('|' + ' Cluster '.padStart((maxWidth + 7) / 2).padEnd(maxWidth - 2) + '|');
  lines.push('+' + '-'.repeat(maxWidth - 2) + '+');

  for (const agent of displayAgents) {
    const label = truncate(agent, maxWidth - 6);
    lines.push('| ' + label.padEnd(maxWidth - 4) + ' |');
  }

  if (agents.length > 8) {
    lines.push(`| ... and ${agents.length - 8} more`.padEnd(maxWidth - 2) + ' |');
  }

  lines.push('+' + '-'.repeat(maxWidth - 2) + '+');

  return lines.join('\n');
}

function truncate(str: string, maxLen: number): string {
  return str.length <= maxLen ? str : str.slice(0, maxLen - 3) + '...';
}
```

### 5.3 JSON Renderer

Outputs dashboard snapshots as structured JSON.

```typescript
// renderers/json-renderer.ts

import type { IOutputRenderer } from '../dashboard-types.js';
import type { DashboardSnapshot, BottleneckAlert } from '../dashboard-types.js';
import type { SwarmHealthMetrics } from '../../swarm-observer-types.js';

/**
 * JSON output renderer for MCP tool integration.
 */
export class JsonRenderer implements IOutputRenderer {
  private readonly pretty: boolean;

  constructor(options?: { pretty?: boolean }) {
    this.pretty = options?.pretty ?? true;
  }

  render(snapshot: DashboardSnapshot): string {
    return this.stringify(snapshot);
  }

  renderAlert(alert: BottleneckAlert): string {
    return this.stringify({
      type: 'alert',
      ...alert,
    });
  }

  renderHealth(health: SwarmHealthMetrics): string {
    return this.stringify({
      type: 'health',
      ...health,
    });
  }

  private stringify(obj: unknown): string {
    return this.pretty ? JSON.stringify(obj, null, 2) : JSON.stringify(obj);
  }
}
```

### 5.4 Text Renderer

Outputs human-readable formatted text.

```typescript
// renderers/text-renderer.ts

import type { IOutputRenderer } from '../dashboard-types.js';
import type { DashboardSnapshot, BottleneckAlert } from '../dashboard-types.js';
import type { SwarmHealthMetrics } from '../../swarm-observer-types.js';

/**
 * Plain text renderer for terminal output.
 */
export class TextRenderer implements IOutputRenderer {
  private readonly useColors: boolean;

  constructor(options?: { useColors?: boolean }) {
    this.useColors = options?.useColors ?? true;
  }

  render(snapshot: DashboardSnapshot): string {
    const lines: string[] = [];

    lines.push(this.header('SWARM DASHBOARD'));
    lines.push(`Timestamp: ${snapshot.timestamp}`);
    lines.push('');

    // Health Section
    lines.push(this.section('HEALTH METRICS'));
    lines.push(this.renderHealth(snapshot.health));
    lines.push('');

    // Alerts Section
    if (snapshot.alerts.length > 0) {
      lines.push(this.section('ACTIVE ALERTS'));
      for (const alert of snapshot.alerts) {
        lines.push(this.renderAlert(alert));
      }
      lines.push('');
    }

    // Interactions Section
    lines.push(this.section('INTERACTIONS'));
    lines.push(`  Total: ${snapshot.interactions.totalEdges}`);
    lines.push(
      `  Success Rate: ${((snapshot.interactions.successfulEdges / (snapshot.interactions.totalEdges || 1)) * 100).toFixed(1)}%`
    );
    lines.push(`  Avg Latency: ${snapshot.interactions.avgLatencyMs.toFixed(1)}ms`);
    lines.push(`  P99 Latency: ${snapshot.interactions.p99LatencyMs.toFixed(1)}ms`);
    lines.push(`  Throughput: ${snapshot.interactions.throughputPerSecond.toFixed(2)}/s`);
    lines.push('');

    // Clusters Section
    if (snapshot.clusters.length > 0) {
      lines.push(this.section('CLUSTERS'));
      for (const cluster of snapshot.clusters) {
        lines.push(
          `  [${cluster.clusterId.slice(0, 8)}] ${cluster.agents.length} agents, cohesion: ${(cluster.cohesion * 100).toFixed(0)}%`
        );
        if (cluster.dominantPattern) {
          lines.push(`    Pattern: ${cluster.dominantPattern}`);
        }
      }
      lines.push('');
    }

    // Top Agents Section
    if (snapshot.topAgents.length > 0) {
      lines.push(this.section('TOP AGENTS'));
      for (let i = 0; i < Math.min(5, snapshot.topAgents.length); i++) {
        const agent = snapshot.topAgents[i];
        lines.push(
          `  ${i + 1}. ${this.truncate(agent.agentId, 20)} - sent: ${agent.messagesSent}, recv: ${agent.messagesReceived}, success: ${(agent.successRate * 100).toFixed(0)}%`
        );
      }
    }

    return lines.join('\n');
  }

  renderAlert(alert: BottleneckAlert): string {
    const severity = alert.bottleneck.severity.toUpperCase();
    const prefix = this.useColors ? this.severityColor(alert.bottleneck.severity) : '';
    const suffix = this.useColors ? '\x1b[0m' : '';

    return `${prefix}[${severity}]${suffix} Agent ${alert.bottleneck.agentId}: ${alert.bottleneck.queuedMessages} queued, ${alert.bottleneck.blockedAgents} blocked (${alert.trend})`;
  }

  renderHealth(health: SwarmHealthMetrics): string {
    const lines: string[] = [];
    lines.push(
      `  Agents: ${health.activeAgents}/${health.totalAgents} active, ${health.errorAgents} errors`
    );
    lines.push(`  Interactions: ${health.totalInteractions}`);
    lines.push(`  Success Rate: ${(health.successRate * 100).toFixed(1)}%`);
    lines.push(`  Avg Latency: ${health.avgLatencyMs.toFixed(1)}ms`);
    lines.push(`  Bottlenecks: ${health.bottlenecks.length}`);
    lines.push(`  Clusters: ${health.clusters.length}`);
    return lines.join('\n');
  }

  private header(title: string): string {
    const line = '='.repeat(50);
    return `${line}\n  ${title}\n${line}`;
  }

  private section(title: string): string {
    return `--- ${title} ${'-'.repeat(50 - title.length - 5)}`;
  }

  private severityColor(severity: string): string {
    switch (severity) {
      case 'critical':
        return '\x1b[31m'; // Red
      case 'high':
        return '\x1b[33m'; // Yellow
      case 'medium':
        return '\x1b[36m'; // Cyan
      default:
        return '\x1b[37m'; // White
    }
  }

  private truncate(str: string, maxLen: number): string {
    return str.length <= maxLen ? str : str.slice(0, maxLen - 3) + '...';
  }
}
```

### 5.5 Table Renderer

Outputs ASCII tables for structured data.

```typescript
// renderers/table-renderer.ts

import type { IOutputRenderer } from '../dashboard-types.js';
import type {
  DashboardSnapshot,
  BottleneckAlert,
  AgentActivitySummary,
} from '../dashboard-types.js';
import type { SwarmHealthMetrics } from '../../swarm-observer-types.js';

/**
 * ASCII table renderer for terminal output.
 */
export class TableRenderer implements IOutputRenderer {
  render(snapshot: DashboardSnapshot): string {
    const sections: string[] = [];

    sections.push(this.renderHealthTable(snapshot.health));
    sections.push('');

    if (snapshot.alerts.length > 0) {
      sections.push(this.renderAlertsTable(snapshot.alerts));
      sections.push('');
    }

    if (snapshot.topAgents.length > 0) {
      sections.push(this.renderAgentsTable(snapshot.topAgents));
    }

    return sections.join('\n');
  }

  renderAlert(alert: BottleneckAlert): string {
    return this.row([
      alert.bottleneck.severity,
      alert.bottleneck.agentId,
      String(alert.bottleneck.queuedMessages),
      String(alert.bottleneck.blockedAgents),
      alert.trend,
    ]);
  }

  renderHealth(health: SwarmHealthMetrics): string {
    return this.renderHealthTable(health);
  }

  private renderHealthTable(health: SwarmHealthMetrics): string {
    const lines: string[] = [];
    lines.push(this.header(['Metric', 'Value']));
    lines.push(this.separator([20, 20]));
    lines.push(this.row(['Total Agents', String(health.totalAgents)]));
    lines.push(this.row(['Active Agents', String(health.activeAgents)]));
    lines.push(this.row(['Error Agents', String(health.errorAgents)]));
    lines.push(this.row(['Interactions', String(health.totalInteractions)]));
    lines.push(this.row(['Success Rate', `${(health.successRate * 100).toFixed(1)}%`]));
    lines.push(this.row(['Avg Latency', `${health.avgLatencyMs.toFixed(1)}ms`]));
    lines.push(this.row(['Bottlenecks', String(health.bottlenecks.length)]));
    lines.push(this.row(['Clusters', String(health.clusters.length)]));
    lines.push(this.separator([20, 20]));
    return lines.join('\n');
  }

  private renderAlertsTable(alerts: BottleneckAlert[]): string {
    const lines: string[] = [];
    lines.push(this.header(['Severity', 'Agent', 'Queued', 'Blocked', 'Trend']));
    lines.push(this.separator([10, 20, 8, 8, 12]));
    for (const alert of alerts) {
      lines.push(
        this.row([
          alert.bottleneck.severity,
          this.truncate(alert.bottleneck.agentId, 20),
          String(alert.bottleneck.queuedMessages),
          String(alert.bottleneck.blockedAgents),
          alert.trend,
        ])
      );
    }
    lines.push(this.separator([10, 20, 8, 8, 12]));
    return lines.join('\n');
  }

  private renderAgentsTable(agents: AgentActivitySummary[]): string {
    const lines: string[] = [];
    lines.push(this.header(['Agent', 'Sent', 'Recv', 'Success', 'Latency']));
    lines.push(this.separator([20, 8, 8, 10, 10]));
    for (const agent of agents.slice(0, 10)) {
      lines.push(
        this.row([
          this.truncate(agent.agentId, 20),
          String(agent.messagesSent),
          String(agent.messagesReceived),
          `${(agent.successRate * 100).toFixed(0)}%`,
          `${agent.avgLatencyMs.toFixed(0)}ms`,
        ])
      );
    }
    lines.push(this.separator([20, 8, 8, 10, 10]));
    return lines.join('\n');
  }

  private header(columns: string[]): string {
    return '| ' + columns.map((c, i) => c.padEnd(this.colWidth(i))).join(' | ') + ' |';
  }

  private separator(widths: number[]): string {
    return '+' + widths.map((w) => '-'.repeat(w + 2)).join('+') + '+';
  }

  private row(values: string[]): string {
    return '| ' + values.map((v, i) => v.padEnd(this.colWidth(i))).join(' | ') + ' |';
  }

  private colWidth(index: number): number {
    const widths = [20, 8, 8, 10, 12];
    return widths[index] ?? 10;
  }

  private truncate(str: string, maxLen: number): string {
    return str.length <= maxLen ? str : str.slice(0, maxLen - 3) + '...';
  }
}
```

---

## 6. MCP Tool Integration

The dashboard provides an MCP tool for querying swarm state.

### 6.1 Tool Definition

```typescript
// mcp/tools/swarm-dashboard.ts

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getSwarmObserver } from '../../observability/index.js';
import { DashboardSubscriber } from '../../observability/dashboard/index.js';
import {
  JsonRenderer,
  TextRenderer,
  TableRenderer,
} from '../../observability/dashboard/renderers/index.js';

/**
 * Input schema for swarm_dashboard tool.
 */
export const SwarmDashboardInputSchema = z.object({
  view: z
    .enum(['health', 'alerts', 'clusters', 'agents', 'full'])
    .default('full')
    .describe('Which view to display'),
  format: z.enum(['json', 'text', 'table']).default('json').describe('Output format'),
  limit: z.number().int().min(1).max(100).default(10).describe('Maximum items to return'),
});

export type SwarmDashboardInput = z.infer<typeof SwarmDashboardInputSchema>;

/**
 * Register the swarm_dashboard tool.
 */
export function registerSwarmDashboardTool(server: McpServer): void {
  server.tool(
    'swarm_dashboard',
    {
      view: SwarmDashboardInputSchema.shape.view,
      format: SwarmDashboardInputSchema.shape.format,
      limit: SwarmDashboardInputSchema.shape.limit,
    },
    async (args) => {
      const input = SwarmDashboardInputSchema.safeParse(args);
      if (!input.success) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Validation error: ${input.error.message}` }],
        };
      }

      const observer = getSwarmObserver();
      const subscriber = new DashboardSubscriber(observer);
      const snapshot = subscriber.getSnapshot();

      const renderer = createRenderer(input.data.format);
      const output = renderView(renderer, snapshot, input.data.view);

      return {
        content: [{ type: 'text', text: output }],
      };
    }
  );
}

function createRenderer(format: string): IOutputRenderer {
  switch (format) {
    case 'text':
      return new TextRenderer();
    case 'table':
      return new TableRenderer();
    default:
      return new JsonRenderer();
  }
}

function renderView(renderer: IOutputRenderer, snapshot: DashboardSnapshot, view: string): string {
  switch (view) {
    case 'health':
      return renderer.renderHealth(snapshot.health);
    case 'alerts':
      return snapshot.alerts.map((a) => renderer.renderAlert(a)).join('\n');
    case 'full':
    default:
      return renderer.render(snapshot);
  }
}
```

---

## 7. Usage Examples

### 7.1 Programmatic Usage

```typescript
import { getSwarmObserver } from 'nexus-agents/observability';
import {
  DashboardSubscriber,
  JsonRenderer,
  TextRenderer,
} from 'nexus-agents/observability/dashboard';

// Create subscriber
const observer = getSwarmObserver();
const dashboard = new DashboardSubscriber(observer, {
  pollIntervalMs: 1000,
  alertSeverity: 'high',
});

// Subscribe to alerts
dashboard.onAlert((alert) => {
  console.error(`ALERT: ${alert.bottleneck.severity} - ${alert.bottleneck.agentId}`);
});

// Subscribe to snapshots
const renderer = new TextRenderer({ useColors: true });
dashboard.onSnapshot((snapshot) => {
  console.log(renderer.render(snapshot));
});

// Start monitoring
dashboard.start();

// Later: stop monitoring
dashboard.stop();
```

### 7.2 MCP Tool Usage

From Claude or another MCP client:

```
Call swarm_dashboard with:
  view: "full"
  format: "text"
```

Response:

```
==================================================
  SWARM DASHBOARD
==================================================
Timestamp: 2026-01-09T14:30:00.000Z

--- HEALTH METRICS ---------------------------------
  Agents: 5/8 active, 1 errors
  Interactions: 127
  Success Rate: 94.5%
  Avg Latency: 45.2ms
  Bottlenecks: 1
  Clusters: 2

--- ACTIVE ALERTS ----------------------------------
[HIGH] Agent expert-reviewer: 12 queued, 3 blocked (worsening)

--- INTERACTIONS -----------------------------------
  Total: 127
  Success Rate: 94.5%
  Avg Latency: 45.2ms
  P99 Latency: 120.3ms
  Throughput: 2.54/s

--- CLUSTERS ---------------------------------------
  [a1b2c3d4] 3 agents, cohesion: 85%
    Pattern: review
  [e5f6g7h8] 2 agents, cohesion: 72%
    Pattern: delegation

--- TOP AGENTS -------------------------------------
  1. tech-lead          - sent: 45, recv: 12, success: 98%
  2. expert-coder       - sent: 32, recv: 28, success: 96%
  3. expert-reviewer    - sent: 18, recv: 35, success: 91%
```

### 7.3 JSON Output for MCP

```json
{
  "timestamp": "2026-01-09T14:30:00.000Z",
  "health": {
    "totalAgents": 8,
    "activeAgents": 5,
    "errorAgents": 1,
    "totalInteractions": 127,
    "successRate": 0.945,
    "avgLatencyMs": 45.2,
    "bottlenecks": [...],
    "clusters": [...],
    "calculatedAt": "2026-01-09T14:30:00.000Z"
  },
  "alerts": [
    {
      "bottleneck": {
        "agentId": "expert-reviewer",
        "queuedMessages": 12,
        "avgWaitTimeMs": 850,
        "blockedAgents": 3,
        "severity": "high"
      },
      "detectedAt": "2026-01-09T14:28:00.000Z",
      "duration": 120000,
      "trend": "worsening"
    }
  ],
  "interactions": {
    "totalEdges": 127,
    "successfulEdges": 120,
    "failedEdges": 5,
    "pendingEdges": 2,
    "avgLatencyMs": 45.2,
    "p99LatencyMs": 120.3,
    "throughputPerSecond": 2.54
  },
  "clusters": [...],
  "topAgents": [...]
}
```

---

## 8. Event Subscription Enhancement

To support real-time updates efficiently, the SwarmObserver should be enhanced with event callbacks (as proposed in E4 of SWARM_OBSERVER_DESIGN.md).

### 8.1 Proposed SwarmObserver Additions

```typescript
// In swarm-observer.ts (enhancement)

type SnapshotCallback = (metrics: SwarmHealthMetrics) => void;
type BottleneckCallback = (bottleneck: BottleneckInfo) => void;
type EventCallback = (event: AgentEvent) => void;

interface ISwarmObserverWithCallbacks extends ISwarmObserver {
  /**
   * Subscribe to health metric updates.
   * Called after each recordEvent/recordInteraction if metrics change.
   */
  onHealthChange(callback: SnapshotCallback): () => void;

  /**
   * Subscribe to new bottleneck detection.
   */
  onBottleneckDetected(callback: BottleneckCallback): () => void;

  /**
   * Subscribe to all events (high-volume, use sparingly).
   */
  onEvent(callback: EventCallback): () => void;
}
```

Until this enhancement is implemented, the DashboardSubscriber uses polling with configurable intervals.

---

## 9. Memory and Performance

### 9.1 Memory Budget

| Component        | Max Memory | Notes                       |
| ---------------- | ---------- | --------------------------- |
| Snapshot History | 10MB       | 100 snapshots max           |
| Rendered Output  | 1MB        | Single render buffer        |
| Alert Tracking   | 1MB        | Deduplication map           |
| **Total**        | < 15MB     | Well under 50MB requirement |

### 9.2 Performance Targets

| Operation           | Target | Notes                    |
| ------------------- | ------ | ------------------------ |
| Snapshot Generation | < 10ms | Reads from SwarmObserver |
| JSON Render         | < 5ms  | Simple stringify         |
| Text Render         | < 10ms | String concatenation     |
| Table Render        | < 15ms | More complex formatting  |
| Poll Cycle          | < 20ms | Total poll overhead      |

---

## 10. Testing Strategy

### 10.1 Unit Tests

- `DashboardSubscriber`: Polling, callbacks, history management
- `DashboardAggregator`: Metric computation, ranking
- `JsonRenderer`: JSON output correctness
- `TextRenderer`: Format correctness, color codes
- `TableRenderer`: Table formatting, column alignment

### 10.2 Integration Tests

- End-to-end: SwarmObserver -> Dashboard -> Rendered output
- MCP tool invocation with various parameters

### 10.3 Property-Based Tests

- Snapshot history never exceeds maxHistory
- All rendered output is valid JSON (for JsonRenderer)
- Alert deduplication works correctly

---

## 11. Implementation Checklist

### Phase 1: Core Dashboard

- [ ] Create `dashboard-types.ts` with type definitions
- [ ] Implement `DashboardSubscriber` with polling
- [ ] Implement `DashboardAggregator` utilities
- [ ] Add unit tests

### Phase 2: Renderers

- [ ] Implement `JsonRenderer`
- [ ] Implement `TextRenderer`
- [ ] Implement `TableRenderer`
- [ ] Add renderer tests

### Phase 3: MCP Integration

- [ ] Create `swarm-dashboard` MCP tool
- [ ] Register tool in MCP server
- [ ] Add integration tests

### Phase 4: Enhancements

- [ ] Add event callbacks to SwarmObserver (E4)
- [ ] Switch DashboardSubscriber to event-driven mode
- [ ] Add performance benchmarks

---

## 12. ADR: Terminal Dashboard Over Web UI

### Context

The dashboard needs to visualize SwarmObserver data. Options considered:

1. **Web UI** - React/Vue dashboard served over HTTP
2. **TUI** - Terminal UI with ncurses/blessed
3. **Plain Text** - Simple text output to stdout
4. **MCP Tool** - Queryable via MCP protocol

### Decision

Implement option 3 (Plain Text) with option 4 (MCP Tool) integration.

### Rationale

- **Simplicity** - No additional runtime dependencies
- **MCP Native** - Fits the existing architecture (nexus-agents is an MCP server)
- **Universal** - Works in any terminal, any SSH session
- **Composable** - JSON output can be piped to other tools
- **Low Overhead** - Minimal resource usage

### Consequences

**Positive:**

- Zero new dependencies
- Works in headless/CI environments
- Easy to integrate with existing MCP clients
- Can evolve to TUI later if needed

**Negative:**

- Less visually rich than web UI
- No interactive features (yet)
- Limited real-time animation

---

_Document generated: 2026-01-09 (ET)_
_Aligned with: MCP Protocol 2025-11-25, CLAUDE.md coding standards_
