/**
 * nexus-agents/observability - SwarmObserver Types
 *
 * Type definitions for swarm-level observability and interaction tracking.
 * Enables measurement of emergent behavior, bottleneck detection, and
 * agent collaboration patterns.
 *
 * @module observability/swarm-observer-types
 * (Source: Alignment Roadmap Phase 1, Issue #158)
 */

// Re-export schemas and defaults from helper file for backward compatibility
export {
  DEFAULT_SWARM_OBSERVER_CONFIG,
  SwarmObserverConfigSchema,
  AgentEventSchema,
} from './swarm-observer-schemas.js';

// Import core types for use in interfaces
import type {
  AgentId,
  TaskId,
  TraceId,
  SpanId,
  EventType,
  InteractionOutcome,
} from './swarm-observer-core-types.js';

// Re-export core types for backward compatibility
export type {
  AgentId,
  TaskId,
  TraceId,
  SpanId,
  EventType,
  AgentState,
  InteractionOutcome,
  SwarmObserverConfig,
} from './swarm-observer-core-types.js';

// Import event payloads for use in interfaces
import type { EventPayload } from './swarm-observer-payloads.js';

// Re-export event payloads for backward compatibility
export type {
  EventPayload,
  StateChangePayload,
  MessagePayload,
  ToolPayload,
  MemoryPayload,
  TaskPayload,
  ErrorPayload,
} from './swarm-observer-payloads.js';

/**
 * Core event emitted by agents for observation.
 */
export interface AgentEvent {
  /** Event ID for deduplication */
  readonly eventId: string;
  /** ISO timestamp when event occurred */
  readonly timestamp: string;
  /** Agent that emitted the event */
  readonly agentId: AgentId;
  /** Type of event */
  readonly eventType: EventType;
  /** OpenTelemetry trace ID for correlation */
  readonly traceId: TraceId;
  /** OpenTelemetry span ID */
  readonly spanId: SpanId;
  /** Parent span ID for hierarchical tracing */
  readonly parentSpanId?: SpanId;
  /** Event-specific payload */
  readonly payload: EventPayload;
  /** Duration in milliseconds (for completed events) */
  readonly durationMs?: number;
}

/**
 * Edge in the interaction graph representing a message/interaction.
 */
export interface InteractionEdge {
  /** Source agent */
  readonly from: AgentId;
  /** Target agent */
  readonly to: AgentId;
  /** Type of interaction */
  readonly interactionType: string;
  /** When interaction occurred */
  readonly timestamp: string;
  /** Outcome of interaction */
  readonly outcome: InteractionOutcome;
  /** Duration if applicable */
  readonly durationMs?: number | undefined;
  /** Trace ID for correlation */
  readonly traceId: TraceId;
  /** Weight for graph algorithms (default 1) */
  readonly weight: number;
}

/**
 * Options for recording an interaction.
 */
export interface RecordInteractionOptions {
  /** Source agent */
  readonly from: AgentId;
  /** Target agent */
  readonly to: AgentId;
  /** Type of interaction */
  readonly interactionType: string;
  /** Outcome of interaction */
  readonly outcome: InteractionOutcome;
  /** Trace ID for correlation */
  readonly traceId: TraceId;
  /** Duration in milliseconds */
  readonly durationMs?: number | undefined;
}

/**
 * Contribution score for a single agent to a task.
 */
export interface ContributionScore {
  readonly agentId: AgentId;
  /** Overall contribution score (0-1) */
  readonly score: number;
  /** Number of messages sent */
  readonly messagesSent: number;
  /** Number of messages received */
  readonly messagesReceived: number;
  /** Time spent actively working (ms) */
  readonly activeTimeMs: number;
  /** Number of successful tool invocations */
  readonly successfulTools: number;
  /** Number of errors encountered */
  readonly errorCount: number;
}

/**
 * Bottleneck information for an agent.
 */
export interface BottleneckInfo {
  readonly agentId: AgentId;
  /** Messages waiting to be processed */
  readonly queuedMessages: number;
  /** Average time messages wait */
  readonly avgWaitTimeMs: number;
  /** Number of agents blocked waiting */
  readonly blockedAgents: number;
  /** Severity level */
  readonly severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Cluster of agents that work together frequently.
 */
export interface AgentCluster {
  /** Cluster identifier */
  readonly clusterId: string;
  /** Agents in this cluster */
  readonly agents: AgentId[];
  /** Cohesion score (0-1, higher = tighter cluster) */
  readonly cohesion: number;
  /** Number of interactions within cluster */
  readonly internalInteractions: number;
  /** Number of interactions with external agents */
  readonly externalInteractions: number;
  /** Dominant interaction pattern */
  readonly dominantPattern?: string | undefined;
}

/**
 * Swarm-level health metrics.
 */
export interface SwarmHealthMetrics {
  /** Total agents in swarm */
  readonly totalAgents: number;
  /** Currently active agents */
  readonly activeAgents: number;
  /** Agents in error state */
  readonly errorAgents: number;
  /** Total interactions in time window */
  readonly totalInteractions: number;
  /** Successful interaction rate (0-1) */
  readonly successRate: number;
  /** Average interaction latency (ms) */
  readonly avgLatencyMs: number;
  /** Current bottlenecks */
  readonly bottlenecks: BottleneckInfo[];
  /** Detected clusters */
  readonly clusters: AgentCluster[];
  /** Timestamp of metrics calculation */
  readonly calculatedAt: string;
}

/**
 * Interface for the SwarmObserver.
 */
export interface ISwarmObserver {
  /**
   * Record an agent event.
   */
  recordEvent(event: AgentEvent): void;

  /**
   * Record an interaction between two agents.
   */
  recordInteraction(options: RecordInteractionOptions): void;

  /**
   * Get the collaboration graph.
   */
  getCollaborationGraph(): InteractionGraph;

  /**
   * Identify bottleneck agents.
   */
  getBottlenecks(): BottleneckInfo[];

  /**
   * Detect emergent clusters of collaborating agents.
   */
  getEmergentClusters(): AgentCluster[];

  /**
   * Attribute success of a task to contributing agents.
   */
  attributeSuccess(taskId: TaskId): Map<AgentId, ContributionScore>;

  /**
   * Get swarm health metrics.
   */
  getHealthMetrics(): SwarmHealthMetrics;

  /**
   * Get events for a specific trace.
   */
  getEventsByTrace(traceId: TraceId): AgentEvent[];

  /**
   * Get events for a specific agent.
   */
  getEventsByAgent(agentId: AgentId): AgentEvent[];

  /**
   * Clear all recorded data.
   */
  clear(): void;
}

/**
 * Interface for the interaction graph.
 */
export interface InteractionGraph {
  /**
   * Add a node (agent) to the graph.
   */
  addNode(agentId: AgentId): void;

  /**
   * Add an edge (interaction) to the graph.
   */
  addEdge(edge: InteractionEdge): void;

  /**
   * Get all nodes in the graph.
   */
  getNodes(): AgentId[];

  /**
   * Get all edges in the graph.
   */
  getEdges(): InteractionEdge[];

  /**
   * Get edges from a specific agent.
   */
  getOutgoingEdges(agentId: AgentId): InteractionEdge[];

  /**
   * Get edges to a specific agent.
   */
  getIncomingEdges(agentId: AgentId): InteractionEdge[];

  /**
   * Calculate degree centrality for all nodes.
   */
  getDegreeCentrality(): Map<AgentId, number>;

  /**
   * Find strongly connected components.
   */
  getStronglyConnectedComponents(): AgentId[][];

  /**
   * Get edge count between two agents.
   */
  getEdgeCount(from: AgentId, to: AgentId): number;

  /**
   * Clear the graph.
   */
  clear(): void;
}
