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
import { getTimeProvider } from '../../core/index.js';
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
import {
  computeReturns,
  computeGradients,
  applyGradientUpdate,
} from './policy-gradient-helpers.js';

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
      const returns = computeReturns(trajectory, finalReward, this.config.discountFactor);
      const gradients = computeGradients(trajectory, returns, this.baseline);
      const { weights: newWeights, gradientNorm } = applyGradientUpdate(
        gradients,
        this.parameters.weights,
        this.currentLearningRate,
        this.config.gradientClip
      );

      this.lastGradientNorm = gradientNorm;
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
  // Private: Parameter Updates
  // ===========================================================================

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
        lastUpdated: getTimeProvider().nowIso(),
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
