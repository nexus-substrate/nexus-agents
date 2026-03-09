/**
 * Spawn depth guard — prevents runaway nested orchestration (#1500).
 *
 * Uses AsyncLocalStorage to track the nesting depth of orchestrate/execute_expert
 * calls. If depth exceeds MAX_SPAWN_DEPTH, the call is rejected.
 *
 * @module mcp/middleware/spawn-depth-guard
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { createLogger } from '../../core/index.js';

const logger = createLogger({ component: 'spawn-depth-guard' });

/** Maximum nesting depth for orchestration calls (orchestrator → expert → sub-task). */
export const MAX_SPAWN_DEPTH = 3;

/** AsyncLocalStorage tracking current spawn depth. */
const depthStorage = new AsyncLocalStorage<number>();

/** Returns the current spawn depth (0 if not inside any orchestration context). */
export function getCurrentDepth(): number {
  return depthStorage.getStore() ?? 0;
}

/**
 * Runs a function at depth + 1. Rejects if depth would exceed MAX_SPAWN_DEPTH.
 *
 * @param label - Tool name for logging (e.g., 'orchestrate', 'execute_expert')
 * @param fn - The function to run at incremented depth
 * @returns Result of fn, or throws if depth exceeded
 */
export async function withDepthGuard<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const currentDepth = getCurrentDepth();
  const nextDepth = currentDepth + 1;

  if (nextDepth > MAX_SPAWN_DEPTH) {
    logger.warn('Spawn depth limit exceeded', {
      label,
      currentDepth,
      maxDepth: MAX_SPAWN_DEPTH,
    });
    throw new Error(
      `Spawn depth limit exceeded (depth=${String(currentDepth)}, max=${String(MAX_SPAWN_DEPTH)}). ` +
        'Nested orchestration is limited to prevent runaway agent trees.'
    );
  }

  logger.debug('Entering depth context', { label, depth: nextDepth });
  return depthStorage.run(nextDepth, fn);
}
