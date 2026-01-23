/**
 * Learning Integration
 *
 * Utilities for connecting the Puppeteer orchestrator to the learning system.
 * Converts orchestration results into policy training data and triggers updates.
 *
 * @module agents/orchestration/learning-integration
 * (Source: Issue #154, arXiv:2505.19591)
 */

import type { PuppeteerResult, PuppeteerStepResult } from './puppeteer-result-types.js';
import type { PolicyTrajectoryStep, ILearnablePolicyEngine } from './policy-types.js';
import type { ExperienceBuffer } from './experience-buffer.js';
import { convertTrajectory } from './trajectory-converter.js';
import { isLearnablePolicyEngine } from './learnable-policy.js';
import { createLogger, isErr } from '../../core/index.js';

// =============================================================================
// Types
// =============================================================================

/**
 * Configuration for learning integration.
 */
export interface LearningIntegrationConfig {
  /** Enable learning on orchestration results (default: true) */
  readonly enableLearning: boolean;
  /** Maximum steps to store in experience buffer (default: 10000) */
  readonly bufferCapacity: number;
  /** Number of episodes to collect before triggering policy update (default: 1) */
  readonly updateAfterEpisodes: number;
}

/** Default learning integration configuration. */
export const DEFAULT_LEARNING_CONFIG: LearningIntegrationConfig = {
  enableLearning: true,
  bufferCapacity: 10000,
  updateAfterEpisodes: 1,
};

// =============================================================================
// Logging
// =============================================================================

const logger = createLogger({ module: 'learning-integration' });

// =============================================================================
// Integration Functions
// =============================================================================

/**
 * Converts Puppeteer trajectory to policy trajectory with error handling.
 */
function tryConvertTrajectory(
  steps: readonly PuppeteerStepResult[],
  sessionId: string
): PolicyTrajectoryStep[] | undefined {
  try {
    const trajectory = convertTrajectory(steps);
    if (trajectory.length === 0) {
      logger.warn('Empty trajectory after conversion', { sessionId });
      return undefined;
    }
    return trajectory;
  } catch (error) {
    logger.warn('Failed to convert trajectory', {
      error: error instanceof Error ? error.message : String(error),
      sessionId,
      trajectoryLength: steps.length,
    });
    return undefined;
  }
}

/**
 * Adds episode to buffer with error handling.
 */
function tryAddEpisode(
  buffer: ExperienceBuffer,
  sessionId: string,
  trajectory: PolicyTrajectoryStep[]
): string | undefined {
  try {
    const episodeId = buffer.addEpisode(sessionId, trajectory);
    logger.debug('Episode added to buffer', {
      episodeId,
      sessionId,
      trajectoryLength: trajectory.length,
      bufferStats: buffer.getStats(),
    });
    return episodeId;
  } catch (error) {
    logger.warn('Failed to add episode to buffer', {
      error: error instanceof Error ? error.message : String(error),
      sessionId,
      trajectoryLength: trajectory.length,
    });
    return undefined;
  }
}

/**
 * Updates policy with error handling.
 */
async function tryUpdatePolicy(
  engine: ILearnablePolicyEngine,
  trajectory: PolicyTrajectoryStep[],
  finalReward: number,
  sessionId: string,
  episodeId: string
): Promise<void> {
  try {
    const updateResult = await engine.updatePolicy(trajectory, finalReward);

    if (isErr(updateResult)) {
      logger.warn('Policy update failed', {
        error: updateResult.error.message,
        code: updateResult.error.code,
        sessionId,
        finalReward,
      });
      return;
    }

    const stats = engine.getStats();
    logger.debug('Policy updated successfully', {
      sessionId,
      episodeId,
      updateCount: stats.updateCount,
      avgReward: stats.avgFinalReward,
      learningRate: stats.currentLearningRate,
    });
  } catch (error) {
    logger.warn('Unexpected error during policy update', {
      error: error instanceof Error ? error.message : String(error),
      sessionId,
      episodeId,
    });
  }
}

/**
 * Process completed orchestration for learning.
 *
 * Converts the orchestration trajectory into policy learning format,
 * adds it to the experience buffer, and triggers policy updates if the
 * policy engine supports learning.
 *
 * The function handles errors gracefully by logging warnings rather than
 * throwing exceptions, allowing orchestration to continue even if learning
 * fails.
 *
 * @param result - The completed orchestration result with trajectory
 * @param buffer - Experience buffer for storing episodes
 * @param policyEngine - Policy engine (may or may not support learning)
 * @returns Promise that resolves when processing is complete
 *
 * @example
 * ```typescript
 * const result = await orchestrator.execute(task);
 * const buffer = new ExperienceBuffer({ maxCapacity: 10000 });
 * const policy = new LearnablePolicy();
 *
 * await processOrchestrationForLearning(result, buffer, policy);
 * ```
 */
export async function processOrchestrationForLearning(
  result: PuppeteerResult,
  buffer: ExperienceBuffer,
  policyEngine: ILearnablePolicyEngine
): Promise<void> {
  try {
    // Step 1: Convert trajectory
    const trajectory = tryConvertTrajectory(result.trajectory, result.sessionId);
    if (trajectory === undefined) {
      return;
    }

    // Step 2: Add to buffer
    const episodeId = tryAddEpisode(buffer, result.sessionId, trajectory);
    if (episodeId === undefined) {
      return;
    }

    // Step 3: Update policy if learnable
    if (!isLearnablePolicyEngine(policyEngine)) {
      logger.debug('Policy engine does not support learning, skipping update', {
        sessionId: result.sessionId,
      });
      return;
    }

    const finalReward = result.metrics.avgReward * result.totalSteps;
    await tryUpdatePolicy(policyEngine, trajectory, finalReward, result.sessionId, episodeId);
  } catch (error) {
    // Top-level error handler to ensure we never propagate
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error('Unexpected error in learning integration', err, {
      sessionId: result.sessionId,
    });
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Checks if a policy engine supports learning.
 *
 * Convenience wrapper around the isLearnablePolicyEngine type guard
 * for use in conditional logic.
 *
 * @param engine - The policy engine to check
 * @returns true if the engine supports learning, false otherwise
 *
 * @example
 * ```typescript
 * if (supportsLearning(policyEngine)) {
 *   await processOrchestrationForLearning(result, buffer, policyEngine);
 * }
 * ```
 */
export function supportsLearning(engine: unknown): engine is ILearnablePolicyEngine {
  return isLearnablePolicyEngine(engine);
}

/**
 * Creates a safe wrapper for learning integration with default error handling.
 *
 * Returns an async function that handles learning integration safely,
 * catching and logging any errors without rethrowing.
 *
 * @param buffer - Experience buffer to use
 * @param policyEngine - Policy engine to update
 * @returns Async function that accepts a PuppeteerResult
 *
 * @example
 * ```typescript
 * const learner = createLearningHandler(buffer, policyEngine);
 * const result = await orchestrator.execute(task);
 * await learner(result); // Errors are logged but not thrown
 * ```
 */
export function createLearningHandler(
  buffer: ExperienceBuffer,
  policyEngine: ILearnablePolicyEngine
): (result: PuppeteerResult) => Promise<void> {
  return (result: PuppeteerResult): Promise<void> =>
    processOrchestrationForLearning(result, buffer, policyEngine);
}

/**
 * Computes the final reward for an episode from orchestration metrics.
 *
 * Combines multiple reward signals into a single scalar value for learning:
 * - Average step reward (weighted by trajectory length)
 * - Task completion bonus
 * - Efficiency penalty (lower steps is better)
 *
 * @param result - The orchestration result with metrics
 * @param completionBonus - Bonus reward if task completed (default: 1.0)
 * @param efficiencyWeight - Weight for efficiency penalty (default: 0.1)
 * @returns Scalar reward for the episode
 *
 * @example
 * ```typescript
 * const episodeReward = computeEpisodeReward(result, 2.0, 0.1);
 * await policy.updatePolicy(trajectory, episodeReward);
 * ```
 */
export function computeEpisodeReward(
  result: PuppeteerResult,
  completionBonus: number = 1.0,
  efficiencyWeight: number = 0.1
): number {
  let reward = result.metrics.avgReward * result.totalSteps;

  // Add completion bonus
  if (result.success) {
    reward += completionBonus;
  }

  // Apply efficiency penalty (encourage fewer steps)
  const maxSteps = 100; // Reasonable default for most tasks
  const efficiencyPenalty = (result.totalSteps / maxSteps) * efficiencyWeight;
  reward -= efficiencyPenalty;

  return reward;
}
