/**
 * nexus-agents/observability - Dashboard
 *
 * Real-time execution dashboard for visualizing SwarmObserver data.
 * Provides agent status, interaction graphs, bottleneck detection,
 * and activity feeds.
 *
 * @module observability/dashboard
 * (Source: Alignment Roadmap Phase 1, Issue #159)
 */

import type {
  DashboardConfig,
  DashboardSnapshot,
  DashboardUpdateOptions,
  IDashboard,
  IDashboardRenderer,
  AgentStatus,
  GraphSummary,
  ActivityItem,
} from './dashboard-types.js';
import { DEFAULT_DASHBOARD_CONFIG } from './dashboard-types.js';
import { getTimeProvider } from '../core/index.js';
import { createDashboardRenderer } from './dashboard-renderer.js';
import type {
  ISwarmObserver,
  AgentId,
  AgentEvent,
  AgentState,
  InteractionGraph,
  SwarmHealthMetrics,
  ContributionScore,
  TraceId,
} from './swarm-observer-types.js';
import {
  extractState,
  summarizeEvent,
  getEventSeverity,
  buildGraphSummary,
  getActiveTracesFromGraph,
} from './dashboard-helpers.js';

// Re-export helpers for backward compatibility
export {
  extractState,
  summarizeEvent,
  getEventSeverity,
  buildGraphSummary,
  getActiveTracesFromGraph,
  summarizeStateChange,
  summarizeMessage,
  summarizeTool,
  summarizeMemory,
  summarizeTask,
  summarizeError,
  buildTopEdges,
} from './dashboard-helpers.js';

/**
 * Dashboard implementation that consumes SwarmObserver data.
 */
export class Dashboard implements IDashboard {
  private config: DashboardConfig;
  private readonly observer: ISwarmObserver;
  private renderer: IDashboardRenderer;
  private readonly subscribers: Set<(snapshot: DashboardSnapshot) => void> = new Set();

  constructor(observer: ISwarmObserver, config?: Partial<DashboardConfig>) {
    this.observer = observer;
    this.config = { ...DEFAULT_DASHBOARD_CONFIG, ...config };
    this.renderer = createDashboardRenderer(this.config);
  }

  getSnapshot(options?: DashboardUpdateOptions): DashboardSnapshot {
    const opts = this.normalizeOptions(options);
    const now = getTimeProvider().nowIso();
    const health = this.observer.getHealthMetrics();
    const graph = this.observer.getCollaborationGraph();

    return {
      timestamp: now,
      health: opts.includeHealth === true ? health : this.emptyHealth(),
      agents: opts.includeAgents === true ? this.buildAgentStatuses(graph, health) : [],
      graph: opts.includeGraph === true ? buildGraphSummary(graph) : this.emptyGraphSummary(),
      activity: opts.includeActivity === true ? this.buildActivityFeed() : [],
      bottlenecks: opts.includeBottlenecks === true ? health.bottlenecks : [],
      clusters: opts.includeClusters === true ? health.clusters : [],
      contributions: opts.includeContributions === true ? this.getContributions() : [],
      activeTraces: this.getActiveTraces(),
    };
  }

  render(options?: DashboardUpdateOptions): string {
    const snapshot = this.getSnapshot(options);
    return this.renderer.render(snapshot);
  }

  getConfig(): DashboardConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<DashboardConfig>): void {
    this.config = { ...this.config, ...config };
    this.renderer = createDashboardRenderer(this.config);
  }

  subscribe(callback: (snapshot: DashboardSnapshot) => void): () => void {
    this.subscribers.add(callback);
    return (): void => {
      this.subscribers.delete(callback);
    };
  }

  /**
   * Notify all subscribers of an update.
   */
  notifySubscribers(): void {
    const snapshot = this.getSnapshot();
    for (const callback of this.subscribers) {
      try {
        callback(snapshot);
      } catch {
        // Ignore subscriber errors
      }
    }
  }

  private normalizeOptions(options?: DashboardUpdateOptions): Required<DashboardUpdateOptions> {
    const defaults = this.getDefaultOptions();
    if (options === undefined) return defaults;

    return {
      includeHealth: options.includeHealth ?? defaults.includeHealth,
      includeAgents: options.includeAgents ?? defaults.includeAgents,
      includeGraph: options.includeGraph ?? defaults.includeGraph,
      includeActivity: options.includeActivity ?? defaults.includeActivity,
      includeBottlenecks: options.includeBottlenecks ?? defaults.includeBottlenecks,
      includeClusters: options.includeClusters ?? defaults.includeClusters,
      includeContributions: options.includeContributions ?? defaults.includeContributions,
    };
  }

  private getDefaultOptions(): Required<DashboardUpdateOptions> {
    return {
      includeHealth: true,
      includeAgents: true,
      includeGraph: this.config.showGraph,
      includeActivity: true,
      includeBottlenecks: this.config.showBottlenecks,
      includeClusters: this.config.showClusters,
      includeContributions: this.config.showContributions,
    };
  }

  private buildAgentStatuses(graph: InteractionGraph, health: SwarmHealthMetrics): AgentStatus[] {
    const nodes = graph.getNodes();
    const bottleneckIds = new Set(health.bottlenecks.map((b) => b.agentId));

    return nodes.map((agentId) => this.buildAgentStatus(agentId, graph, bottleneckIds));
  }

  private buildAgentStatus(
    agentId: AgentId,
    graph: InteractionGraph,
    bottleneckIds: Set<AgentId>
  ): AgentStatus {
    const events = this.observer.getEventsByAgent(agentId);
    const outgoing = graph.getOutgoingEdges(agentId);
    const incoming = graph.getIncomingEdges(agentId);

    // Get latest state from events
    const stateEvents = events.filter((e) => e.eventType === 'state_change');
    const lastStateEvent = stateEvents[stateEvents.length - 1];
    const latestState =
      lastStateEvent !== undefined ? extractState(lastStateEvent) : ('idle' as AgentState);

    // Count metrics
    const toolEvents = events.filter((e) => e.eventType === 'tool_invoked');
    const errorEvents = events.filter((e) => e.eventType === 'error');
    const lastEvent = events[events.length - 1];

    return {
      agentId,
      state: latestState,
      lastActivity: lastEvent?.timestamp ?? getTimeProvider().nowIso(),
      messagesSent: outgoing.length,
      messagesReceived: incoming.length,
      toolsInvoked: toolEvents.length,
      errorCount: errorEvents.length,
      isBottleneck: bottleneckIds.has(agentId),
    };
  }

  private buildActivityFeed(): ActivityItem[] {
    const graph = this.observer.getCollaborationGraph();
    const agents = graph.getNodes();

    // Collect recent events from all agents
    const allEvents: AgentEvent[] = [];
    for (const agentId of agents) {
      const events = this.observer.getEventsByAgent(agentId);
      allEvents.push(...events);
    }

    // Sort by timestamp descending
    allEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Filter to time window
    const cutoff = getTimeProvider().now() - this.config.timeWindowMs;
    const recentEvents = allEvents.filter((e) => new Date(e.timestamp).getTime() > cutoff);

    // Convert to activity items
    return recentEvents.slice(0, this.config.maxEventsShown).map((event) => ({
      timestamp: event.timestamp,
      agentId: event.agentId,
      eventType: event.eventType,
      summary: summarizeEvent(event),
      severity: getEventSeverity(event),
      traceId: event.traceId,
    }));
  }

  private getContributions(): ContributionScore[] {
    // Get all active traces and find the most recent task
    const traces = this.getActiveTraces();
    if (traces.length === 0) {
      return [];
    }

    // Use first trace as task context
    const contributions = this.observer.attributeSuccess(traces[0] ?? '');
    return Array.from(contributions.values());
  }

  private getActiveTraces(): TraceId[] {
    const graph = this.observer.getCollaborationGraph();
    return getActiveTracesFromGraph(graph, this.config.timeWindowMs);
  }

  private emptyHealth(): SwarmHealthMetrics {
    return {
      totalAgents: 0,
      activeAgents: 0,
      errorAgents: 0,
      totalInteractions: 0,
      successRate: 0,
      avgLatencyMs: 0,
      bottlenecks: [],
      clusters: [],
      calculatedAt: getTimeProvider().nowIso(),
    };
  }

  private emptyGraphSummary(): GraphSummary {
    return {
      nodeCount: 0,
      edgeCount: 0,
      density: 0,
      stronglyConnectedComponents: 0,
      topEdges: [],
      centralAgents: [],
    };
  }
}

/**
 * Create a new dashboard instance.
 */
export function createDashboard(
  observer: ISwarmObserver,
  config?: Partial<DashboardConfig>
): Dashboard {
  return new Dashboard(observer, config);
}
