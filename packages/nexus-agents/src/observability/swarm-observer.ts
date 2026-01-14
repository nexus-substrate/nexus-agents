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
 *
 * File length justification: Core SwarmObserver class with types already
 * extracted to swarm-observer-types.ts. Private methods are tightly coupled
 * to class state (events, graph, agentStates) and cannot cleanly extract.
 */

import { randomUUID } from 'node:crypto';
import type {
  AgentId,
  TaskId,
  TraceId,
  SpanId,
  AgentEvent,
  InteractionEdge,
  ContributionScore,
  BottleneckInfo,
  AgentCluster,
  SwarmHealthMetrics,
  SwarmObserverConfig,
  ISwarmObserver,
  InteractionGraph,
  AgentState,
  RecordInteractionOptions,
} from './swarm-observer-types.js';
import {
  DEFAULT_SWARM_OBSERVER_CONFIG,
  SwarmObserverConfigSchema,
} from './swarm-observer-types.js';
import { DirectedInteractionGraph } from './interaction-graph.js';

/**
 * Queue metrics for bottleneck detection.
 */
interface AgentQueueMetrics {
  agentId: AgentId;
  pendingMessages: number;
  lastMessageTime: number;
  totalWaitTimeMs: number;
  messageCount: number;
}

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
          severity: this.calculateSeverity(metrics.pendingMessages, blockedAgents),
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

      const cohesion = this.calculateClusterCohesion(component);
      if (cohesion < this.config.cohesionThreshold) continue;

      const { internal, external } = this.countClusterInteractions(component);

      clusters.push({
        clusterId: randomUUID(),
        agents: component,
        cohesion,
        internalInteractions: internal,
        externalInteractions: external,
        dominantPattern: this.findDominantPattern(component),
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

      scores.set(agentId, this.calculateContribution(agentId, taskEvents));
    }

    return this.normalizeScores(scores);
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

  private calculateSeverity(
    queuedMessages: number,
    blockedAgents: number
  ): 'low' | 'medium' | 'high' | 'critical' {
    const score = queuedMessages + blockedAgents * 2;
    if (score >= 20) return 'critical';
    if (score >= 10) return 'high';
    if (score >= 5) return 'medium';
    return 'low';
  }

  private calculateClusterCohesion(agents: AgentId[]): number {
    if (agents.length < 2) return 0;

    let internalEdges = 0;
    const agentSet = new Set(agents);

    for (const agent of agents) {
      const outgoing = this.graph.getOutgoingEdges(agent);
      for (const edge of outgoing) {
        if (agentSet.has(edge.to)) {
          internalEdges++;
        }
      }
    }

    const maxPossible = agents.length * (agents.length - 1);
    return maxPossible > 0 ? internalEdges / maxPossible : 0;
  }

  private countClusterInteractions(agents: AgentId[]): { internal: number; external: number } {
    const agentSet = new Set(agents);
    let internal = 0;
    let external = 0;

    for (const agent of agents) {
      for (const edge of this.graph.getOutgoingEdges(agent)) {
        if (agentSet.has(edge.to)) {
          internal++;
        } else {
          external++;
        }
      }
    }

    return { internal, external };
  }

  private findDominantPattern(agents: AgentId[]): string | undefined {
    const agentSet = new Set(agents);
    const patterns = new Map<string, number>();

    for (const agent of agents) {
      for (const edge of this.graph.getOutgoingEdges(agent)) {
        if (agentSet.has(edge.to)) {
          const count = patterns.get(edge.interactionType) ?? 0;
          patterns.set(edge.interactionType, count + 1);
        }
      }
    }

    let maxCount = 0;
    let dominant: string | undefined;
    for (const [pattern, count] of patterns) {
      if (count > maxCount) {
        maxCount = count;
        dominant = pattern;
      }
    }

    return dominant;
  }

  private isTaskEvent(event: AgentEvent, taskId: TaskId): boolean {
    if (event.payload.type === 'task') {
      const payload = event.payload as { type: 'task'; taskId: TaskId };
      return payload.taskId === taskId;
    }
    return false;
  }

  private calculateContribution(agentId: AgentId, events: AgentEvent[]): ContributionScore {
    let messagesSent = 0;
    let messagesReceived = 0;
    let activeTimeMs = 0;
    let successfulTools = 0;
    let errorCount = 0;

    for (const event of events) {
      if (event.payload.type === 'message') {
        if (event.payload.direction === 'sent') messagesSent++;
        else messagesReceived++;
      } else if (event.payload.type === 'tool' && event.payload.phase === 'completed') {
        if (event.payload.success === true) successfulTools++;
      } else if (event.payload.type === 'error') {
        errorCount++;
      }
      if (event.durationMs !== undefined && event.durationMs > 0) {
        activeTimeMs += event.durationMs;
      }
    }

    // Simple scoring: weight successful actions, penalize errors
    const score = messagesSent * 0.1 + successfulTools * 0.3 - errorCount * 0.2;

    return {
      agentId,
      score: Math.max(0, Math.min(1, score)),
      messagesSent,
      messagesReceived,
      activeTimeMs,
      successfulTools,
      errorCount,
    };
  }

  private normalizeScores(
    scores: Map<AgentId, ContributionScore>
  ): Map<AgentId, ContributionScore> {
    const total = Array.from(scores.values()).reduce((sum, s) => sum + s.score, 0);
    if (total === 0) return scores;

    for (const [agentId, contribution] of scores) {
      scores.set(agentId, {
        ...contribution,
        score: contribution.score / total,
      });
    }

    return scores;
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
