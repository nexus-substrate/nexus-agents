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
  type TokenUsage,
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

// Backward compatibility aliases (deprecated, will be removed in v3.0)
// These re-exports allow existing code to continue working during migration
/* eslint-disable @typescript-eslint/no-deprecated */
export {
  type SwarmStats,
  type SwarmObserverEvent,
  type SwarmObserverListener,
  type SwarmObserverConfig,
  type SwarmObserverOptions,
  type ISwarmObserver,
  SwarmObserverConfigSchema,
} from './orchestration-observer-types.js';
/* eslint-enable @typescript-eslint/no-deprecated */

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

// Backward compatibility aliases (deprecated, will be removed in v3.0)
/* eslint-disable @typescript-eslint/no-deprecated */
export { SwarmObserver, createSwarmObserver } from './orchestration-observer.js';
/* eslint-enable @typescript-eslint/no-deprecated */
