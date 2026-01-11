/**
 * nexus-agents/agents - Observability Module
 *
 * Real-time visibility into multi-agent orchestration.
 *
 * @module agents/observability
 */

// Types and interfaces
export {
  AgentStateSchema,
  SwarmObserverConfigSchema,
  ObserverTopics,
  type AgentState,
  type TrackedAgent,
  type RoutingDecision,
  type TokenUsage,
  type CostMetrics,
  type SessionMetrics,
  type SwarmStats,
  type SwarmObserverEvent,
  type SwarmObserverListener,
  type SwarmObserverConfig,
  type SwarmObserverOptions,
  type ISwarmObserver,
} from './swarm-observer-types.js';

// Implementation
export { SwarmObserver, createSwarmObserver } from './swarm-observer.js';
