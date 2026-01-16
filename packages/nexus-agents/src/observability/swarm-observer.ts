/**
 * nexus-agents/observability - SwarmObserver
 *
 * Swarm-level observability for tracking agent interactions, detecting
 * bottlenecks, identifying emergent clusters, and attributing success.
 * Uses DirectedInteractionGraph for graph-based analysis.
 *
 * NOTE: This is the canonical SwarmObserver (graph-based interaction analysis).
 * For EventBus-based orchestration visibility, see agents/observability/OrchestrationObserver
 * which was previously named SwarmObserver (renamed in Issue #251).
 *
 * @module observability/swarm-observer
 * (Source: Alignment Roadmap Phase 1, Issue #158)
 */

import { randomUUID } from 'node:crypto';
import type {
  AgentId,
  TaskId,
  TraceId,
  SpanId,
  AgentEvent,
  ContributionScore,
  BottleneckInfo,
  AgentCluster,
  SwarmHealthMetrics,
  SwarmObserverConfig,
  ISwarmObserver,
  InteractionGraph,
  AgentState,
  RecordInteractionOptions,
  InteractionEdge,
} from './swarm-observer-types.js';
import {
  DEFAULT_SWARM_OBSERVER_CONFIG,
  SwarmObserverConfigSchema,
} from './swarm-observer-types.js';
import { DirectedInteractionGraph } from './interaction-graph.js';
import {
  type AgentQueueMetrics,
  calculateSeverity,
  calculateClusterCohesion,
  countClusterInteractions,
  findDominantPattern,
  calculateContribution,
  normalizeScores,
} from './swarm-observer-helpers.js';

/**
 * SwarmObserver implementation.
 */
export class SwarmObserver implements ISwarmObserver {
  private readonly config: SwarmObserverConfig;
  private readonly events: AgentEvent[] = [];
  private readonly graph: DirectedInteractionGraph;
  private readonly agentStates: Map<AgentId, AgentState> = new Map();
  private readonly agentQueues: Map<AgentId, AgentQueueMetrics> = new Map();
  private readonly taskAgents: Map<TaskId, Set<AgentId>> = new Map();

  constructor(config?: Partial<SwarmObserverConfig>) {
    this.config = SwarmObserverConfigSchema.parse({
      ...DEFAULT_SWARM_OBSERVER_CONFIG,
      ...config,
    });
    this.graph = new DirectedInteractionGraph();
  }

  /**
   * Generate OpenTelemetry-compatible trace ID (32 hex chars).
   */
  static generateTraceId(): TraceId {
    return randomUUID().replace(/-/g, '');
  }

  /**
   * Generate OpenTelemetry-compatible span ID (16 hex chars).
   */
  static generateSpanId(): SpanId {
    return randomUUID().replace(/-/g, '').slice(0, 16);
  }

  /**
   * Record an agent event.
   */
  recordEvent(event: AgentEvent): void {
    this.enforceEventLimit();
    this.events.push(event);
    this.graph.addNode(event.agentId);
    this.updateAgentState(event);
    this.updateQueueMetrics(event);
  }

  /**
   * Record an interaction between two agents.
   */
  recordInteraction(options: RecordInteractionOptions): void {
    const { from, to, interactionType, outcome, traceId, durationMs } = options;
    const edge: InteractionEdge = {
      from,
      to,
      interactionType,
      timestamp: new Date().toISOString(),
      outcome,
      traceId,
      weight: outcome === 'success' ? 1 : 0.5,
    };
    if (durationMs !== undefined) {
      (edge as { durationMs: number }).durationMs = durationMs;
    }
    this.graph.addEdge(edge);
    this.incrementPendingMessages(to);
  }

  /**
   * Get the collaboration graph.
   */
  getCollaborationGraph(): InteractionGraph {
    return this.graph;
  }

  /**
   * Identify bottleneck agents.
   */
  getBottlenecks(): BottleneckInfo[] {
    const bottlenecks: BottleneckInfo[] = [];

    for (const [agentId, metrics] of this.agentQueues) {
      if (metrics.pendingMessages >= this.config.bottleneckThreshold) {
        const avgWaitTime =
          metrics.messageCount > 0 ? metrics.totalWaitTimeMs / metrics.messageCount : 0;

        const blockedAgents = this.countBlockedAgents(agentId);

        bottlenecks.push({
          agentId,
          queuedMessages: metrics.pendingMessages,
          avgWaitTimeMs: avgWaitTime,
          blockedAgents,
          severity: calculateSeverity(metrics.pendingMessages, blockedAgents),
        });
      }
    }

    return bottlenecks.sort((a, b) => b.queuedMessages - a.queuedMessages);
  }

  /**
   * Detect emergent clusters of collaborating agents.
   * Uses strongly connected components + cohesion analysis.
   */
  getEmergentClusters(): AgentCluster[] {
    const components = this.graph.getStronglyConnectedComponents();
    const clusters: AgentCluster[] = [];

    for (const component of components) {
      if (component.length < this.config.minClusterSize) continue;

      const cohesion = calculateClusterCohesion(component, this.graph);
      if (cohesion < this.config.cohesionThreshold) continue;

      const { internal, external } = countClusterInteractions(component, this.graph);

      clusters.push({
        clusterId: randomUUID(),
        agents: component,
        cohesion,
        internalInteractions: internal,
        externalInteractions: external,
        dominantPattern: findDominantPattern(component, this.graph),
      });
    }

    return clusters.sort((a, b) => b.cohesion - a.cohesion);
  }

  /**
   * Attribute success of a task to contributing agents.
   */
  attributeSuccess(taskId: TaskId): Map<AgentId, ContributionScore> {
    const scores = new Map<AgentId, ContributionScore>();
    const taskAgentIds = this.taskAgents.get(taskId);

    if (!taskAgentIds || taskAgentIds.size === 0) {
      return scores;
    }

    for (const agentId of taskAgentIds) {
      const events = this.getEventsByAgent(agentId);
      const taskEvents = events.filter((e) => this.isTaskEvent(e, taskId));

      scores.set(agentId, calculateContribution(agentId, taskEvents));
    }

    return normalizeScores(scores);
  }

  /**
   * Get swarm health metrics.
   */
  getHealthMetrics(): SwarmHealthMetrics {
    const nodes = this.graph.getNodes();
    const edges = this.graph.getEdges();
    const windowStart = Date.now() - this.config.metricsWindowMs;

    const recentEdges = edges.filter((e) => new Date(e.timestamp).getTime() >= windowStart);

    const successCount = recentEdges.filter((e) => e.outcome === 'success').length;
    const totalLatency = recentEdges.reduce((sum, e) => sum + (e.durationMs ?? 0), 0);

    const activeAgents = this.countActiveAgents(windowStart);
    const errorAgents = this.countErrorAgents();

    return {
      totalAgents: nodes.length,
      activeAgents,
      errorAgents,
      totalInteractions: recentEdges.length,
      successRate: recentEdges.length > 0 ? successCount / recentEdges.length : 0,
      avgLatencyMs: recentEdges.length > 0 ? totalLatency / recentEdges.length : 0,
      bottlenecks: this.getBottlenecks(),
      clusters: this.getEmergentClusters(),
      calculatedAt: new Date().toISOString(),
    };
  }

  /**
   * Get events for a specific trace.
   */
  getEventsByTrace(traceId: TraceId): AgentEvent[] {
    return this.events.filter((e) => e.traceId === traceId);
  }

  /**
   * Get events for a specific agent.
   */
  getEventsByAgent(agentId: AgentId): AgentEvent[] {
    return this.events.filter((e) => e.agentId === agentId);
  }

  /**
   * Associate an agent with a task for attribution.
   */
  registerAgentForTask(taskId: TaskId, agentId: AgentId): void {
    let agents = this.taskAgents.get(taskId);
    if (!agents) {
      agents = new Set();
      this.taskAgents.set(taskId, agents);
    }
    agents.add(agentId);
  }

  /**
   * Clear all recorded data.
   */
  clear(): void {
    this.events.length = 0;
    this.graph.clear();
    this.agentStates.clear();
    this.agentQueues.clear();
    this.taskAgents.clear();
  }

  // ==========================================================================
  // Private helpers
  // ==========================================================================

  private enforceEventLimit(): void {
    if (this.events.length >= this.config.maxEvents) {
      // Remove oldest 10%
      const removeCount = Math.ceil(this.config.maxEvents * 0.1);
      this.events.splice(0, removeCount);
    }
  }

  private updateAgentState(event: AgentEvent): void {
    if (event.payload.type === 'state_change') {
      const payload = event.payload as { type: 'state_change'; newState: AgentState };
      this.agentStates.set(event.agentId, payload.newState);
    }
  }

  private updateQueueMetrics(event: AgentEvent): void {
    if (event.payload.type === 'message' && event.payload.direction === 'received') {
      const metrics = this.getOrCreateQueueMetrics(event.agentId);
      metrics.pendingMessages = Math.max(0, metrics.pendingMessages - 1);
      const waitTime = Date.now() - metrics.lastMessageTime;
      metrics.totalWaitTimeMs += waitTime;
      metrics.messageCount++;
    }
  }

  private getOrCreateQueueMetrics(agentId: AgentId): AgentQueueMetrics {
    let metrics = this.agentQueues.get(agentId);
    if (!metrics) {
      metrics = {
        agentId,
        pendingMessages: 0,
        lastMessageTime: Date.now(),
        totalWaitTimeMs: 0,
        messageCount: 0,
      };
      this.agentQueues.set(agentId, metrics);
    }
    return metrics;
  }

  private incrementPendingMessages(agentId: AgentId): void {
    const metrics = this.getOrCreateQueueMetrics(agentId);
    metrics.pendingMessages++;
    metrics.lastMessageTime = Date.now();
  }

  private countBlockedAgents(targetAgentId: AgentId): number {
    const incoming = this.graph.getIncomingEdges(targetAgentId);
    const recentlyBlocked = new Set<AgentId>();
    const threshold = Date.now() - 60000; // Last minute

    for (const edge of incoming) {
      if (new Date(edge.timestamp).getTime() >= threshold && edge.outcome === 'pending') {
        recentlyBlocked.add(edge.from);
      }
    }

    return recentlyBlocked.size;
  }

  private isTaskEvent(event: AgentEvent, taskId: TaskId): boolean {
    if (event.payload.type === 'task') {
      const payload = event.payload as { type: 'task'; taskId: TaskId };
      return payload.taskId === taskId;
    }
    return false;
  }

  private countActiveAgents(windowStart: number): number {
    const activeAgents = new Set<AgentId>();
    for (const event of this.events) {
      if (new Date(event.timestamp).getTime() >= windowStart) {
        activeAgents.add(event.agentId);
      }
    }
    return activeAgents.size;
  }

  private countErrorAgents(): number {
    let count = 0;
    for (const state of this.agentStates.values()) {
      if (state === 'error') count++;
    }
    return count;
  }
}

/**
 * Create a new SwarmObserver instance.
 */
export function createSwarmObserver(config?: Partial<SwarmObserverConfig>): ISwarmObserver {
  return new SwarmObserver(config);
}

/**
 * Global SwarmObserver instance.
 */
let globalObserver: SwarmObserver | undefined;

/**
 * Get or create the global SwarmObserver.
 */
export function getSwarmObserver(config?: Partial<SwarmObserverConfig>): SwarmObserver {
  globalObserver ??= new SwarmObserver(config);
  return globalObserver;
}

/**
 * Set the global SwarmObserver.
 */
export function setSwarmObserver(observer: SwarmObserver): void {
  globalObserver = observer;
}
