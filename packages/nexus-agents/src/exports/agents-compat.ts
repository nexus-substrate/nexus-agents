/**
 * Backward compatibility aliases for agent exports (deprecated, will be removed in v3.0)
 * Split from agents.ts for file size compliance (Issue #285)
 */

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
} from '../agents/index.js';
/* eslint-enable @typescript-eslint/no-deprecated */
