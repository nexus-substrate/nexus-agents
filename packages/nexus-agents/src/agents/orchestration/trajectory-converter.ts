/**
 * Trajectory Converter
 *
 * Converts Puppeteer orchestration step results into policy learning trajectories.
 * Extracts log probabilities from agent distributions and prepares data for the
 * learning system (REINFORCE with baseline).
 *
 * @module agents/orchestration/trajectory-converter
 * (Source: Issue #154, arXiv:2505.19591)
 */

import type { PuppeteerStepResult, AgentDistribution } from './puppeteer-types.js';
import type { PolicyTrajectoryStep } from './policy-types.js';

// =============================================================================
// Constants
// =============================================================================

/** Minimum probability threshold to avoid log(0). */
const MIN_PROBABILITY = 1e-10;

// =============================================================================
// Trajectory Conversion
// =============================================================================

/**
 * Extracts the log probability of an action from an agent distribution.
 *
 * Given an agent distribution (probability map) and a selected agent,
 * computes log(probability) for use in policy gradient calculations.
 * Applies a minimum probability floor to prevent log(0).
 *
 * @param distribution - Agent selection distribution with probabilities
 * @param selectedAgent - ID of the agent that was selected
 * @returns Log probability of the selected action (can be negative)
 * @throws Error if selected agent not found in distribution
 */
function extractLogProbability(distribution: AgentDistribution, selectedAgent: string): number {
  const probability = distribution.probabilities.get(selectedAgent);

  if (probability === undefined) {
    throw new Error(
      `Selected agent "${selectedAgent}" not found in distribution. ` +
        `Available agents: ${Array.from(distribution.probabilities.keys()).join(', ')}`
    );
  }

  // Clamp probability to prevent log(0)
  const clampedProb = Math.max(probability, MIN_PROBABILITY);

  // Return log probability (negative for prob < 1)
  return Math.log(clampedProb);
}

/**
 * Converts a sequence of Puppeteer step results into a learning trajectory.
 *
 * Transforms the raw orchestration steps into the format required by the
 * learning system (REINFORCE with baseline). Each step includes:
 * - The state at that point in the trajectory
 * - The action (agent ID) taken
 * - The reward received for that step
 * - The log probability of that action under the policy
 *
 * The trajectory is used for policy gradient updates:
 * ∇log π(a|s) * advantage = ∇log π(a|s) * (reward - baseline)
 *
 * @param steps - Array of Puppeteer orchestration step results
 * @returns Array of policy trajectory steps ready for learning
 * @throws Error if any step has invalid distribution or missing agent
 *
 * @example
 * ```typescript
 * const puppeteerResults: PuppeteerStepResult[] = [...];
 * const trajectory = convertTrajectory(puppeteerResults);
 * await learnablePolicy.updatePolicy(trajectory, finalReward);
 * ```
 */
export function convertTrajectory(steps: readonly PuppeteerStepResult[]): PolicyTrajectoryStep[] {
  // #4766: a step whose token usage was never measured carries `reward: null`
  // and is dropped here rather than fitted at a fabricated value. This is the
  // exclusion itself — everything else only propagates the flag.
  return steps
    .filter((step): step is (typeof steps)[number] & { reward: number } => step.reward !== null)
    .map((step): PolicyTrajectoryStep => {
      const logProb = extractLogProbability(step.distribution, step.selectedAgent);

      return {
        state: step.newState,
        action: step.selectedAgent,
        reward: step.reward,
        logProb,
      };
    });
}

/**
 * Converts a single Puppeteer step result into a policy trajectory step.
 *
 * Utility function for converting individual steps. Useful when processing
 * steps incrementally rather than as a batch.
 *
 * @param step - A single Puppeteer step result
 * @returns A single policy trajectory step
 * @throws Error if step has invalid distribution
 *
 * @example
 * ```typescript
 * const result = await orchestrator.step();
 * const trajectoryStep = convertSingleStep(result);
 * ```
 */
export function convertSingleStep(step: PuppeteerStepResult): PolicyTrajectoryStep | null {
  // Null for an unscored step, mirroring the batch converter: the caller must
  // decide to drop it rather than receive a fabricated reward (#4766).
  if (step.reward === null) return null;
  const logProb = extractLogProbability(step.distribution, step.selectedAgent);

  return {
    state: step.newState,
    action: step.selectedAgent,
    reward: step.reward,
    logProb,
  };
}

/**
 * Validates that a distribution has all required agents present.
 *
 * Checks that the probability map is non-empty and all probabilities
 * are finite numbers in the range [0, 1].
 *
 * @param distribution - Agent distribution to validate
 * @param minAgents - Minimum number of agents required (default: 1)
 * @returns true if distribution is valid, false otherwise
 */
export function isValidDistribution(
  distribution: AgentDistribution,
  minAgents: number = 1
): boolean {
  const { probabilities } = distribution;

  // Check minimum agent count
  if (probabilities.size < minAgents) {
    return false;
  }

  // Check all probabilities are valid
  const probs = Array.from(probabilities.values());
  for (const prob of probs) {
    if (!Number.isFinite(prob) || prob < 0 || prob > 1) {
      return false;
    }
  }

  // Check probabilities sum to approximately 1 (allowing for floating point error)
  let sum = 0;
  for (const prob of probs) {
    sum += prob;
  }
  const tolerance = 1e-6;
  return Math.abs(sum - 1) < tolerance;
}

/**
 * Safely converts a trajectory with validation.
 *
 * Wraps {@link convertTrajectory} with validation of all distributions.
 * Returns undefined if any step has an invalid distribution.
 *
 * @param steps - Array of Puppeteer step results to convert
 * @returns Converted trajectory if valid, undefined if any step is invalid
 *
 * @example
 * ```typescript
 * const trajectory = convertTrajectoryWithValidation(steps);
 * if (trajectory) {
 *   await policy.updatePolicy(trajectory, finalReward);
 * } else {
 *   logger.warn('Invalid trajectory distribution');
 * }
 * ```
 */
export function convertTrajectoryWithValidation(
  steps: readonly PuppeteerStepResult[]
): PolicyTrajectoryStep[] | undefined {
  // Validate all distributions before processing
  for (const step of steps) {
    if (!isValidDistribution(step.distribution)) {
      return undefined;
    }
  }

  // All distributions valid, proceed with conversion
  try {
    return convertTrajectory(steps);
  } catch {
    return undefined;
  }
}
