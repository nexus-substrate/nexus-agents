/**
 * Backward compatibility aliases for observability types.
 *
 * @deprecated These exports will be removed in v3.0. Use the new names:
 * - SwarmObserver -> OrchestrationObserver
 * - SwarmStats -> OrchestrationStats
 * - etc.
 */

/* eslint-disable @typescript-eslint/no-deprecated */
// Re-export deprecated types from observability (intentional for backward compatibility)
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
} from './observability/index.js';
