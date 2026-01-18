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
  if (Date.now() - startTime >= config.timeoutMs) return true;
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

  if (state.step >= config.maxSteps) return 'max_steps';
  if (Date.now() - startTime >= config.timeoutMs) return 'timeout';

  return 'max_steps';
}
