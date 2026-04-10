/**
 * Observability exports - Swarm-level observability for multi-agent systems
 * Split from index.ts for file size compliance (Issue #285)
 * Added to public API per Issue #351
 *
 * Note: OrchestrationObserver is exported via agents.ts (backward compatible as SwarmObserver).
 * This module exports the swarm-level interaction tracking components from observability/.
 */

export {
  // ==========================================================================
  // SwarmObserver Types (from observability/swarm-observer-types.ts)
  // These are different from the OrchestrationObserver types in agents/observability
  // ==========================================================================
  type AgentId,
  type TaskId,
  type TraceId,
  type SpanId,
  type EventType,
  // Note: AgentState here is 'idle' | 'thinking' | 'executing' | 'waiting' | 'error'
  // This conflicts with core's AgentState, so we rename it
  type AgentState as SwarmAgentState,
  type InteractionOutcome,
  type AgentEvent,
  type EventPayload,
  type StateChangePayload,
  type MessagePayload,
  type ToolPayload,
  type MemoryPayload,
  type TaskPayload,
  type ErrorPayload,
  type InteractionEdge,
  type RecordInteractionOptions,
  type ContributionScore,
  type BottleneckInfo,
  type AgentCluster,
  type SwarmHealthMetrics,
  // Note: SwarmObserverConfig conflicts with agents.ts backward compat export
  // We use a unique name for the swarm-level observer config
  type SwarmObserverConfig as InteractionObserverConfig,
  // Note: ISwarmObserver conflicts with agents.ts backward compat export
  type ISwarmObserver as IInteractionObserver,
  type InteractionGraph,
  // SwarmObserver Schemas and Defaults
  DEFAULT_SWARM_OBSERVER_CONFIG,
  // Note: SwarmObserverConfigSchema conflicts with agents.ts
  SwarmObserverConfigSchema as InteractionObserverConfigSchema,
  AgentEventSchema,
  // ==========================================================================
  // Interaction Graph
  // ==========================================================================
  DirectedInteractionGraph,
  createInteractionGraph,
  type GraphStats,
  // ==========================================================================
  // SwarmObserver Implementation (Interaction tracking - different from OrchestrationObserver)
  // Using unique names to avoid conflicts with agents.ts backward compat exports
  // ==========================================================================
  SwarmObserver as InteractionSwarmObserver,
  createSwarmObserver as createInteractionSwarmObserver,
  getSwarmObserver,
  setSwarmObserver,
  // ==========================================================================
  // Dashboard Types
  // ==========================================================================
  type DashboardFormat,
  type DashboardConfig,
  type AgentStatus,
  type GraphEdgeDisplay,
  type GraphSummary,
  type ActivityItem,
  type DashboardSnapshot,
  type DashboardUpdateOptions,
  type IDashboardRenderer,
  type IDashboard,
  DEFAULT_DASHBOARD_CONFIG,
  DashboardConfigSchema,
  // ==========================================================================
  // Dashboard Renderers
  // ==========================================================================
  TextDashboardRenderer,
  JsonDashboardRenderer,
  CompactDashboardRenderer,
  createDashboardRenderer,
  // ==========================================================================
  // Dashboard
  // ==========================================================================
  Dashboard,
  createDashboard,
  // ==========================================================================
  // Routing Metrics (Issue #171)
  // ==========================================================================
  type RoutingRecord,
  type OutcomeRecord,
  type ModelMetrics,
  type RoutingMetrics,
  type RoutingDashboardConfig,
  type RoutingMetricsConfig,
  RoutingMetricsCollector,
  createRoutingMetricsCollector,
  // ==========================================================================
  // Validation Dashboard (Issue #273)
  // ==========================================================================
  type TimePeriod,
  type ModelPerformanceSummary,
  type TaskTypePerformance,
  type LearningProgress,
  type DashboardSummary,
  type DashboardHealthIndicators,
  type DashboardFilter,
  type DashboardRenderOptions,
  type DashboardOutcome,
  DEFAULT_DASHBOARD_RENDER_OPTIONS,
  ValidationDashboard,
  createValidationDashboard,
} from '../observability/index.js';

// =============================================================================
// Orchestration Observer Helper Functions (not exported via agents.ts)
// These are utility functions from agents/observability that may be useful
// =============================================================================
export {
  extractStringField,
  extractNumberField,
  extractBooleanField,
  extractStringArrayField,
  extractSessionId,
  createInitialSessionMetrics,
  createInitialTokenUsage,
  createInitialCostMetrics,
  createTrackedAgent,
  calculateRoutingDistribution,
  calculateMetricsTotals,
  countActiveSessions,
  findActiveSession,
  identifySessionsToRemove,
  calculateTokenCost,
  // Orchestration Observer Types (TypeDoc #1741, #1756)
  type RoutingDecision as ObserverRoutingDecision, // Renamed: multiple modules define RoutingDecision
  type IOrchestrationObserver,
  type ConsensusStats,
  type SessionMetrics as ObserverSessionMetrics,
  type TokenUsage as ObserverTokenUsage, // Renamed: core.ts exports TokenUsage
  type CostMetrics as ObserverCostMetrics,
  type TrackedAgent as ObserverTrackedAgent, // Renamed: core types may also export TrackedAgent
  type OrchestrationStats,
  type OrchestrationObserverListener,
  type OrchestrationObserverEvent,
  type AgentState as ObserverAgentState, // Renamed: swarm observer also exports AgentState
} from '../agents/observability/index.js';

// Pipeline Task Tracker (TypeDoc #1756)
export type { ITaskTracker, TrackedTask } from '../pipeline/task-tracker.js';

// IHindsightBeliefMemory intentionally not exported — it's an optional config type
// referenced by DevPipelineOptions.beliefMemory. Exporting it cascades 7+ context
// types into the public API. Added to typedoc.json intentionallyNotExported instead.
