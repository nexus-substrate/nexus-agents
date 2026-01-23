/**
 * Learnable Policy Engine
 *
 * Policy gradient implementation using REINFORCE with baseline.
 * Updates feature weights based on observed trajectories and rewards.
 *
 * @module agents/orchestration/learnable-policy
 * (Source: Issue #154, arXiv:2505.19591)
 */

import { ok, err } from '../../core/result.js';
import type { Result } from '../../core/result.js';
import type { PuppeteerState, AgentDistribution } from './puppeteer-types.js';
import type {
  ILearnablePolicyEngine,
  PolicyParameters,
  PolicyError,
  PolicyTrajectoryStep,
  LearnablePolicyConfig,
  LearnablePolicyStats,
} from './policy-types.js';
import {
  PolicyError as PolicyErrorClass,
  DEFAULT_LEARNABLE_CONFIG,
  DEFAULT_POLICY_PARAMETERS,
} from './policy-types.js';

// Import extracted modules
import { extractFeatures } from './policy-feature-extraction.js';
import type { ScoringFeatures } from './policy-feature-extraction.js';
import { computeAllAgentScores } from './policy-scoring.js';
import type { AgentScores } from './policy-scoring.js';
import { scoresToDistribution, sampleFromDistribution } from './policy-distribution.js';

// =============================================================================
// Constants
// =============================================================================

/** Feature weight keys that can be learned. */
const LEARNABLE_WEIGHTS = [
  'recency',
  'capability_match',
  'cost_efficiency',
  'pattern_match',
] as const;

// =============================================================================
// Learnable Policy Implementation
// =============================================================================

/**
 * Learnable policy engine using REINFORCE with baseline.
 *
 * Implements policy gradient learning:
 * - Computes advantage = reward - baseline
 * - Updates weights via gradient ascent on log probability
 * - Applies gradient clipping for stability
 * - Uses learning rate decay over time
 */
export class LearnablePolicy implements ILearnablePolicyEngine {
  private readonly config: Required<LearnablePolicyConfig>;
  private parameters: PolicyParameters;

  // Learning state
  private baseline: number = 0;
  private currentLearningRate: number;
  private updateCount: number = 0;
  private lastGradientNorm: number = 0;

  // Statistics
  private totalEpisodes: number = 0;
  private totalSteps: number = 0;
  private totalReward: number = 0;

  constructor(config: LearnablePolicyConfig = {}) {
    this.config = { ...DEFAULT_LEARNABLE_CONFIG, ...config };
    this.parameters = this.createDefaultParameters();
    this.currentLearningRate = this.config.learningRate;
  }

  // ===========================================================================
  // IPolicyEngine Implementation
  // ===========================================================================

  /**
   * Compute probability distribution over agents.
   */
  computeDistribution(
    state: PuppeteerState,
    availableAgents: readonly string[]
  ): Promise<Result<AgentDistribution, PolicyError>> {
    if (availableAgents.length === 0) {
      return Promise.resolve(err(new PolicyErrorClass('No agents available', 'NO_AGENTS')));
    }

    try {
      const features = extractFeatures(state);
      const scores = this.computeScores(availableAgents, features);
      const distribution = scoresToDistribution(
        scores,
        availableAgents,
        this.config.temperature,
        this.config.minProbability
      );
      return Promise.resolve(ok(distribution));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return Promise.resolve(
        err(new PolicyErrorClass(`Computation failed: ${message}`, 'COMPUTATION_FAILED'))
      );
    }
  }

  /**
   * Sample an agent from the distribution.
   */
  sampleAgent(distribution: AgentDistribution): string {
    return sampleFromDistribution(distribution, this.config.deterministic);
  }

  /**
   * Get current policy parameters.
   */
  getParameters(): PolicyParameters {
    return {
      ...this.parameters,
      metadata: {
        ...this.parameters.metadata,
        updateCount: this.updateCount,
        baseline: this.baseline,
        currentLearningRate: this.currentLearningRate,
      },
    };
  }

  /**
   * Load policy parameters.
   */
  loadParameters(params: PolicyParameters): void {
    this.parameters = { ...params };
    // Restore learning state from metadata if present
    const meta = params.metadata;
    if (typeof meta.updateCount === 'number') this.updateCount = meta.updateCount;
    if (typeof meta.baseline === 'number') this.baseline = meta.baseline;
    if (typeof meta.currentLearningRate === 'number') {
      this.currentLearningRate = meta.currentLearningRate;
    }
  }

  // ===========================================================================
  // ILearnablePolicyEngine Implementation
  // ===========================================================================

  /**
   * Update policy based on observed trajectory using REINFORCE.
   */
  updatePolicy(
    trajectory: readonly PolicyTrajectoryStep[],
    finalReward: number
  ): Promise<Result<void, PolicyError>> {
    if (trajectory.length === 0) {
      return Promise.resolve(ok(undefined));
    }

    try {
      const returns = this.computeReturns(trajectory, finalReward);
      const gradients = this.computeGradients(trajectory, returns);
      const newWeights = this.applyGradientUpdate(gradients);

      this.updateParametersAndStats(newWeights, finalReward, trajectory.length);

      return Promise.resolve(ok(undefined));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return Promise.resolve(
        err(new PolicyErrorClass(`Update failed: ${message}`, 'UPDATE_FAILED'))
      );
    }
  }

  /**
   * Compute gradients across trajectory steps.
   */
  private computeGradients(
    trajectory: readonly PolicyTrajectoryStep[],
    returns: number[]
  ): Record<string, number> {
    const gradients: Record<string, number> = {};
    for (const key of LEARNABLE_WEIGHTS) {
      gradients[key] = 0;
    }

    for (let t = 0; t < trajectory.length; t++) {
      const step = trajectory[t];
      const returnValue = returns[t];
      if (step === undefined || returnValue === undefined) continue;

      const advantage = returnValue - this.baseline;
      const features = extractFeatures(step.state);
      const featureValues = this.extractFeatureValues(features);

      for (const key of LEARNABLE_WEIGHTS) {
        const featureVal = featureValues[key] ?? 0;
        const currentGrad = gradients[key] ?? 0;
        gradients[key] = currentGrad + advantage * featureVal;
      }
    }

    // Normalize by trajectory length
    for (const key of LEARNABLE_WEIGHTS) {
      const currentGrad = gradients[key] ?? 0;
      gradients[key] = currentGrad / trajectory.length;
    }

    return gradients;
  }

  /**
   * Apply gradient update with clipping and weight normalization.
   */
  private applyGradientUpdate(gradients: Record<string, number>): Record<string, number> {
    const gradNorm = Math.sqrt(Object.values(gradients).reduce((sum, g) => sum + g * g, 0));
    this.lastGradientNorm = gradNorm;

    const clipRatio =
      gradNorm > this.config.gradientClip ? this.config.gradientClip / gradNorm : 1.0;

    const newWeights = { ...this.parameters.weights };
    for (const key of LEARNABLE_WEIGHTS) {
      const currentWeight = newWeights[key] ?? 0;
      const gradient = gradients[key] ?? 0;
      newWeights[key] = currentWeight + this.currentLearningRate * gradient * clipRatio;
    }

    return this.normalizeWeights(newWeights);
  }

  /**
   * Normalize weights to sum to 1.
   */
  private normalizeWeights(weights: Record<string, number>): Record<string, number> {
    const weightSum = Object.values(weights).reduce((s, w) => s + Math.abs(w), 0);
    if (weightSum === 0) return weights;

    const normalized = { ...weights };
    for (const key of Object.keys(normalized)) {
      const weight = normalized[key] ?? 0;
      normalized[key] = Math.abs(weight) / weightSum;
    }
    return normalized;
  }

  /**
   * Update policy parameters and learning statistics.
   */
  private updateParametersAndStats(
    newWeights: Record<string, number>,
    finalReward: number,
    trajectoryLength: number
  ): void {
    const prevTrained = this.parameters.metadata.trainedOnTasks;
    const trainedCount = typeof prevTrained === 'number' ? prevTrained : 0;

    this.parameters = {
      ...this.parameters,
      weights: newWeights,
      metadata: {
        ...this.parameters.metadata,
        trainedOnTasks: trainedCount + 1,
        lastUpdated: new Date().toISOString(),
      },
    };

    this.baseline =
      this.config.baselineDecay * this.baseline + (1 - this.config.baselineDecay) * finalReward;

    this.currentLearningRate = Math.max(
      this.config.minLearningRate,
      this.currentLearningRate * this.config.learningRateDecay
    );

    this.updateCount++;
    this.totalEpisodes++;
    this.totalSteps += trajectoryLength;
    this.totalReward += finalReward;
  }

  /**
   * Get learning statistics.
   */
  getStats(): LearnablePolicyStats {
    return {
      updateCount: this.updateCount,
      currentLearningRate: this.currentLearningRate,
      baseline: this.baseline,
      lastGradientNorm: this.lastGradientNorm,
      totalEpisodes: this.totalEpisodes,
      avgEpisodeLength: this.totalEpisodes > 0 ? this.totalSteps / this.totalEpisodes : 0,
      avgFinalReward: this.totalEpisodes > 0 ? this.totalReward / this.totalEpisodes : 0,
    };
  }

  /**
   * Check if policy has completed warmup phase.
   */
  isWarmedUp(): boolean {
    return this.updateCount >= this.config.warmupUpdates;
  }

  // ===========================================================================
  // Private: Gradient Computation
  // ===========================================================================

  /**
   * Compute discounted returns for each step.
   * Returns[t] = reward[t] + gamma * reward[t+1] + gamma^2 * reward[t+2] + ...
   */
  private computeReturns(
    trajectory: readonly PolicyTrajectoryStep[],
    finalReward: number
  ): number[] {
    const returns: number[] = Array.from({ length: trajectory.length }, () => 0);
    const gamma = this.config.discountFactor;

    // Bootstrap from final reward
    let runningReturn = finalReward;

    // Compute returns backwards
    for (let t = trajectory.length - 1; t >= 0; t--) {
      const step = trajectory[t];
      if (step !== undefined) {
        runningReturn = step.reward + gamma * runningReturn;
        returns[t] = runningReturn;
      }
    }

    return returns;
  }

  /**
   * Extract feature values from scoring features.
   */
  private extractFeatureValues(features: ScoringFeatures): Record<string, number> {
    return {
      recency: features.recentAgents.length > 0 ? 0.5 : 1.0,
      capability_match: features.taskKeywords.length > 0 ? 0.8 : 0.2,
      cost_efficiency: 0.5, // Neutral default
      pattern_match: features.lastPattern !== undefined && features.lastPattern !== '' ? 0.7 : 0.3,
    };
  }

  // ===========================================================================
  // Private: Scoring
  // ===========================================================================

  private computeScores(
    agents: readonly string[],
    features: ScoringFeatures
  ): Map<string, AgentScores> {
    return computeAllAgentScores(
      agents,
      features,
      this.parameters.weights,
      this.parameters.biases,
      this.config.repetitionPenalty
    );
  }

  // ===========================================================================
  // Private: Initialization
  // ===========================================================================

  private createDefaultParameters(): PolicyParameters {
    return {
      ...DEFAULT_POLICY_PARAMETERS,
      metadata: {
        ...DEFAULT_POLICY_PARAMETERS.metadata,
        policyType: 'learnable',
        algorithm: 'REINFORCE',
      },
    };
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a learnable policy engine.
 */
export function createLearnablePolicy(config?: LearnablePolicyConfig): ILearnablePolicyEngine {
  return new LearnablePolicy(config);
}

/**
 * Type guard for learnable policy engine.
 */
export function isLearnablePolicyEngine(engine: unknown): engine is ILearnablePolicyEngine {
  return (
    engine !== null &&
    typeof engine === 'object' &&
    'updatePolicy' in engine &&
    'getStats' in engine &&
    'isWarmedUp' in engine
  );
}
