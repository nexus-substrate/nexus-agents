/**
 * nexus-agents/agents - Observability Module
 *
 * Real-time visibility into multi-agent orchestration.
 * (Renamed from SwarmObserver in Issue #251 to avoid collision with observability/swarm-observer.ts)
 *
 * @module agents/observability
 */

// Types and interfaces (new names)
export {
  AgentStateSchema,
  OrchestrationObserverConfigSchema,
  ObserverTopics,
  type AgentState,
  type TrackedAgent,
  type RoutingDecision,
  type SessionTokenTotals,
  type CostMetrics,
  type SessionMetrics,
  type OrchestrationStats,
  type ConsensusStats,
  type OrchestrationObserverEvent,
  type OrchestrationObserverListener,
  type OrchestrationObserverConfig,
  type OrchestrationObserverOptions,
  type IOrchestrationObserver,
} from './orchestration-observer-types.js';

// Implementation (new names)
export { OrchestrationObserver, createOrchestrationObserver } from './orchestration-observer.js';

// Helper functions
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
} from './orchestration-observer-helpers.js';

// Backward compatibility: SwarmObserver was renamed to OrchestrationObserver in v2.x
export { SwarmObserver, createSwarmObserver } from './orchestration-observer.js';
