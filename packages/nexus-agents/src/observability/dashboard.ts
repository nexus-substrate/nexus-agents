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
  GraphEdgeDisplay,
  ActivityItem,
} from './dashboard-types.js';
import { DEFAULT_DASHBOARD_CONFIG } from './dashboard-types.js';
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
    const now = new Date().toISOString();
    const health = this.observer.getHealthMetrics();
    const graph = this.observer.getCollaborationGraph();

    return {
      timestamp: now,
      health: opts.includeHealth === true ? health : this.emptyHealth(),
      agents: opts.includeAgents === true ? this.buildAgentStatuses(graph, health) : [],
      graph: opts.includeGraph === true ? this.buildGraphSummary(graph) : this.emptyGraphSummary(),
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
      lastStateEvent !== undefined ? this.extractState(lastStateEvent) : ('idle' as AgentState);

    // Count metrics
    const toolEvents = events.filter((e) => e.eventType === 'tool_invoked');
    const errorEvents = events.filter((e) => e.eventType === 'error');
    const lastEvent = events[events.length - 1];

    return {
      agentId,
      state: latestState,
      lastActivity: lastEvent?.timestamp ?? new Date().toISOString(),
      messagesSent: outgoing.length,
      messagesReceived: incoming.length,
      toolsInvoked: toolEvents.length,
      errorCount: errorEvents.length,
      isBottleneck: bottleneckIds.has(agentId),
    };
  }

  private extractState(event: AgentEvent): AgentState {
    if (event.payload.type === 'state_change') {
      return event.payload.newState;
    }
    return 'idle';
  }

  private buildGraphSummary(graph: InteractionGraph): GraphSummary {
    const nodes = graph.getNodes();
    const edges = graph.getEdges();
    const nodeCount = nodes.length;
    const edgeCount = edges.length;

    // Calculate density: actual edges / possible edges
    const possibleEdges = nodeCount * (nodeCount - 1);
    const density = possibleEdges > 0 ? edgeCount / possibleEdges : 0;

    // Get SCCs
    const sccs = graph.getStronglyConnectedComponents();

    // Get centrality
    const centrality = graph.getDegreeCentrality();
    const centralAgents = Array.from(centrality.entries())
      .map(([agentId, cent]) => ({ agentId, centrality: cent }))
      .sort((a, b) => b.centrality - a.centrality)
      .slice(0, 5);

    // Build top edges
    const topEdges = this.buildTopEdges(graph);

    return {
      nodeCount,
      edgeCount,
      density,
      stronglyConnectedComponents: sccs.length,
      topEdges,
      centralAgents,
    };
  }

  private buildTopEdges(graph: InteractionGraph): GraphEdgeDisplay[] {
    const edges = graph.getEdges();
    const edgeMap = new Map<string, { count: number; successes: number; totalLatency: number }>();

    for (const edge of edges) {
      const key = `${edge.from}|${edge.to}`;
      const existing = edgeMap.get(key) ?? { count: 0, successes: 0, totalLatency: 0 };
      existing.count++;
      if (edge.outcome === 'success') {
        existing.successes++;
      }
      if (edge.durationMs !== undefined) {
        existing.totalLatency += edge.durationMs;
      }
      edgeMap.set(key, existing);
    }

    return Array.from(edgeMap.entries())
      .map(([key, stats]) => {
        const [from, to] = key.split('|');
        return {
          from: from ?? '',
          to: to ?? '',
          count: stats.count,
          successRate: stats.count > 0 ? stats.successes / stats.count : 0,
          avgLatencyMs: stats.count > 0 ? stats.totalLatency / stats.count : 0,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
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
    const cutoff = Date.now() - this.config.timeWindowMs;
    const recentEvents = allEvents.filter((e) => new Date(e.timestamp).getTime() > cutoff);

    // Convert to activity items
    return recentEvents.slice(0, this.config.maxEventsShown).map((event) => ({
      timestamp: event.timestamp,
      agentId: event.agentId,
      eventType: event.eventType,
      summary: this.summarizeEvent(event),
      severity: this.getEventSeverity(event),
      traceId: event.traceId,
    }));
  }

  private summarizeEvent(event: AgentEvent): string {
    const summaryHandlers: Record<string, () => string> = {
      state_change: () => this.summarizeStateChange(event),
      message: () => this.summarizeMessage(event),
      tool: () => this.summarizeTool(event),
      memory: () => this.summarizeMemory(event),
      task: () => this.summarizeTask(event),
      error: () => this.summarizeError(event),
    };

    const handler = summaryHandlers[event.payload.type];
    return handler !== undefined ? handler() : event.eventType;
  }

  private summarizeStateChange(event: AgentEvent): string {
    if (event.payload.type !== 'state_change') return '';
    return `${event.payload.previousState} → ${event.payload.newState}`;
  }

  private summarizeMessage(event: AgentEvent): string {
    if (event.payload.type !== 'message') return '';
    const { direction, messageType, targetAgentId, sourceAgentId } = event.payload;
    if (direction === 'sent') {
      return `sent ${messageType} to ${targetAgentId ?? 'unknown'}`;
    }
    return `recv ${messageType} from ${sourceAgentId ?? 'unknown'}`;
  }

  private summarizeTool(event: AgentEvent): string {
    if (event.payload.type !== 'tool') return '';
    const { phase, toolName, success } = event.payload;
    if (phase === 'invoked') return `invoking ${toolName}`;
    return success === true ? `${toolName} succeeded` : `${toolName} failed`;
  }

  private summarizeMemory(event: AgentEvent): string {
    if (event.payload.type !== 'memory') return '';
    return `${event.payload.operation} ${event.payload.memoryType}`;
  }

  private summarizeTask(event: AgentEvent): string {
    if (event.payload.type !== 'task') return '';
    const { phase, taskDescription, taskId, success } = event.payload;
    if (phase === 'started') return `started: ${taskDescription ?? taskId}`;
    return success === true ? `completed: ${taskId}` : `failed: ${taskId}`;
  }

  private summarizeError(event: AgentEvent): string {
    if (event.payload.type !== 'error') return '';
    return `error: ${event.payload.errorMessage.slice(0, 30)}`;
  }

  private getEventSeverity(event: AgentEvent): 'info' | 'warning' | 'error' {
    if (event.eventType === 'error') {
      return 'error';
    }
    if (event.payload.type === 'tool' && event.payload.success === false) {
      return 'warning';
    }
    if (event.payload.type === 'task' && event.payload.success === false) {
      return 'warning';
    }
    if (event.payload.type === 'state_change' && event.payload.newState === 'error') {
      return 'error';
    }
    return 'info';
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
    const edges = graph.getEdges();

    // Get unique traces from recent edges
    const traces = new Set<TraceId>();
    const cutoff = Date.now() - this.config.timeWindowMs;

    for (const edge of edges) {
      if (new Date(edge.timestamp).getTime() > cutoff) {
        traces.add(edge.traceId);
      }
    }

    return Array.from(traces);
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
      calculatedAt: new Date().toISOString(),
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
