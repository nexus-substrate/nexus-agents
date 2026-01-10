/**
 * nexus-agents/observability - Module Exports
 *
 * Swarm-level observability for multi-agent systems.
 *
 * @module observability
 */

// Types
export type {
  AgentId,
  TaskId,
  TraceId,
  SpanId,
  EventType,
  AgentState,
  InteractionOutcome,
  AgentEvent,
  EventPayload,
  StateChangePayload,
  MessagePayload,
  ToolPayload,
  MemoryPayload,
  TaskPayload,
  ErrorPayload,
  InteractionEdge,
  RecordInteractionOptions,
  ContributionScore,
  BottleneckInfo,
  AgentCluster,
  SwarmHealthMetrics,
  SwarmObserverConfig,
  ISwarmObserver,
  InteractionGraph,
} from './swarm-observer-types.js';

export {
  DEFAULT_SWARM_OBSERVER_CONFIG,
  SwarmObserverConfigSchema,
  AgentEventSchema,
} from './swarm-observer-types.js';

// Interaction Graph
export { DirectedInteractionGraph, createInteractionGraph } from './interaction-graph.js';
export type { GraphStats } from './interaction-graph.js';

// SwarmObserver
export {
  SwarmObserver,
  createSwarmObserver,
  getSwarmObserver,
  setSwarmObserver,
} from './swarm-observer.js';
