/**
 * nexus-agents/agents - Observability Module Exports
 *
 * Re-exports for OrchestrationObserver and deprecated SwarmObserver.
 */

// Observability (OrchestrationObserver - renamed from SwarmObserver in Issue #251)
export {
  // Types and schemas (new names)
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
  type OrchestrationObserverEvent,
  type OrchestrationObserverListener,
  type OrchestrationObserverConfig,
  type OrchestrationObserverOptions,
  type IOrchestrationObserver,
  // Implementation (new names)
  OrchestrationObserver,
  createOrchestrationObserver,
} from './observability/index.js';

// Backward compatibility aliases (deprecated, will be removed in v3.0)
/* eslint-disable @typescript-eslint/no-deprecated */
export {
  SwarmObserverConfigSchema,
  type SwarmStats,
  type SwarmObserverEvent,
  type SwarmObserverListener,
  type SwarmObserverConfig,
  type SwarmObserverOptions,
  type ISwarmObserver,
  SwarmObserver,
  createSwarmObserver,
} from './deprecated-exports.js';
/* eslint-enable @typescript-eslint/no-deprecated */
