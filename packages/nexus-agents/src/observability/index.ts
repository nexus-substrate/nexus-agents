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

// Dashboard Types
export type {
  DashboardFormat,
  DashboardConfig,
  AgentStatus,
  GraphEdgeDisplay,
  GraphSummary,
  ActivityItem,
  DashboardSnapshot,
  DashboardUpdateOptions,
  IDashboardRenderer,
  IDashboard,
} from './dashboard-types.js';

export { DEFAULT_DASHBOARD_CONFIG, DashboardConfigSchema } from './dashboard-types.js';

// Dashboard Renderers
export {
  TextDashboardRenderer,
  JsonDashboardRenderer,
  CompactDashboardRenderer,
  createDashboardRenderer,
} from './dashboard-renderer.js';

// Dashboard
export { Dashboard, createDashboard } from './dashboard.js';

// Routing Metrics (Issue #171)
export type {
  RoutingRecord,
  OutcomeRecord,
  ModelMetrics,
  RoutingMetrics,
  DashboardConfig as RoutingDashboardConfig,
  RoutingMetricsConfig,
} from './routing-metrics.js';

export { RoutingMetricsCollector, createRoutingMetricsCollector } from './routing-metrics.js';
