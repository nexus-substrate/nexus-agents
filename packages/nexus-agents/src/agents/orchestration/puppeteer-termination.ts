/**
 * Puppeteer Termination Logic
 *
 * Handles termination condition checks and reason determination.
 * Extracted from puppeteer-orchestrator.ts for modularity.
 *
 * @module agents/orchestration/puppeteer-termination
 */

import type {
  PuppeteerConfig,
  PuppeteerState,
  PuppeteerStepResult,
  PuppeteerTerminationReason,
} from './puppeteer-types.js';
import { getTimeProvider } from '../../core/index.js';

// =============================================================================
// Termination Context
// =============================================================================

/**
 * Context for termination checks.
 */
export interface TerminationContext {
  readonly config: Required<PuppeteerConfig>;
  readonly cancelled: boolean;
}

// =============================================================================
// Termination Functions
// =============================================================================

/**
 * Check if orchestration should terminate based on current state.
 */
export function shouldTerminate(
  context: TerminationContext,
  state: PuppeteerState,
  _trajectory: readonly PuppeteerStepResult[],
  startTime: number
): boolean {
  const { config, cancelled } = context;

  if (cancelled) return true;
  if (state.step >= config.maxSteps) return true;
  if (getTimeProvider().now() - startTime >= config.timeoutMs) return true;
  if (state.metadata.totalCost >= config.maxCostBudget) return true;

  return false;
}

/**
 * Determine the reason for termination.
 */
export function determineTerminationReason(
  context: TerminationContext,
  state: PuppeteerState,
  trajectory: readonly PuppeteerStepResult[],
  startTime: number
): PuppeteerTerminationReason {
  const { config, cancelled } = context;

  if (cancelled) return 'cancelled';

  const lastStep = trajectory[trajectory.length - 1];
  if (lastStep?.terminationReason) return lastStep.terminationReason;

  // Mirrors `shouldTerminate`'s order above. Any condition that can stop the
  // loop must have a branch here, or it silently borrows another one's name.
  if (state.step >= config.maxSteps) return 'max_steps';
  if (getTimeProvider().now() - startTime >= config.timeoutMs) return 'timeout';
  if (state.metadata.totalCost >= config.maxCostBudget) return 'budget_exceeded';

  // The loop stopped for a reason none of the guards above explains. Naming it
  // `unknown` is the point: the previous trailing `return 'max_steps'` let a
  // budget stop at step 6 of 50 claim it had run out of steps, and no consumer
  // could tell the difference without re-deriving the arithmetic itself.
  return 'unknown';
}
