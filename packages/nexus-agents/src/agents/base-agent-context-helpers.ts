/**
 * nexus-agents/agents - BaseAgent Context Helper Functions (Issue #352)
 *
 * Helper functions for context pruning methods in BaseAgent.
 * Extracted to reduce file size in base-agent.ts.
 *
 * @module agents/base-agent-context-helpers
 */

import type { ContextPruningMetrics } from './base-agent-pruning-init.js';

/**
 * Creates a fresh copy of the context pruning metrics for observability.
 * Returns a shallow copy to prevent external mutation.
 */
export function copyPruningMetrics(
  metrics: ContextPruningMetrics
): Readonly<ContextPruningMetrics> {
  return { ...metrics };
}

/**
 * Creates initial context pruning metrics with zeroed values.
 */
export function createInitialPruningMetrics(): ContextPruningMetrics {
  return {
    pruningRounds: 0,
    totalTokensPruned: 0,
    lastPruningTokens: 0,
    lastPruningItemsRemoved: 0,
    lastPruningTargetReached: false,
  };
}
