/**
 * Policy Engine Types
 *
 * Type definitions for policy engines that compute agent selection distributions.
 *
 * @module agents/orchestration/policy-types
 * (Source: Issue #335, arXiv:2505.19591)
 */

import { z } from 'zod';
import { getTimeProvider } from '../../core/index.js';
import type { Result } from '../../core/result.js';
import type { PuppeteerState, AgentDistribution } from './puppeteer-types.js';

// =============================================================================
// Policy Error
// =============================================================================

/** Error codes for policy operations. */
export type PolicyErrorCode =
  | 'INVALID_STATE'
  | 'NO_AGENTS'
  | 'COMPUTATION_FAILED'
  | 'UPDATE_FAILED'
  | 'PARAMETERS_INVALID';

/**
 * Error class for policy operations.
 */
export class PolicyError extends Error {
  constructor(
    message: string,
    public readonly code: PolicyErrorCode,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'PolicyError';
    Object.setPrototypeOf(this, PolicyError.prototype);
  }
}

// =============================================================================
// Trajectory Types
// =============================================================================

/**
 * A single step in a policy trajectory.
 */
export interface PolicyTrajectoryStep {
  /** State at this step */
  readonly state: PuppeteerState;
  /** Action (agent ID) taken */
  readonly action: string;
  /** Reward received */
  readonly reward: number;
  /** Log probability of the action */
  readonly logProb: number;
}

// =============================================================================
// Policy Parameters
// =============================================================================

/**
 * Policy parameters for persistence and warm start.
 */
export interface PolicyParameters {
  /** Version identifier */
  readonly version: string;
  /** Feature weights */
  readonly weights: Readonly<Record<string, number>>;
  /** Agent biases */
  readonly biases: Readonly<Record<string, number>>;
  /** Additional metadata */
  readonly metadata: Readonly<Record<string, unknown>>;
}

/** Default policy parameters. */
export const DEFAULT_POLICY_PARAMETERS: PolicyParameters = {
  version: '1.0.0',
  weights: {
    recency: 0.3,
    capability_match: 0.4,
    cost_efficiency: 0.2,
    pattern_match: 0.1,
  },
  biases: {},
  metadata: {
    created: new Date(getTimeProvider().now()).toISOString(),
    trainedOnTasks: 0,
  },
};

// =============================================================================
// Policy Configuration
// =============================================================================

/**
 * Configuration for rule-based policy.
 */
export interface RuleBasedPolicyConfig {
  /** Temperature for softmax sampling (higher = more exploration) */
  readonly temperature?: number;
  /** Whether to use deterministic selection (argmax) vs sampling */
  readonly deterministic?: boolean;
  /** Penalty for selecting the same agent consecutively */
  readonly repetitionPenalty?: number;
  /** Minimum probability for any agent */
  readonly minProbability?: number;
}

/** Default rule-based policy configuration. */
export const DEFAULT_RULE_BASED_CONFIG: Required<RuleBasedPolicyConfig> = {
  temperature: 1.0,
  deterministic: false,
  repetitionPenalty: 0.3,
  minProbability: 0.01,
};

/**
 * Configuration for learnable policy (REINFORCE with baseline).
 * (Source: Issue #154, arXiv:2505.19591)
 */
export interface LearnablePolicyConfig extends RuleBasedPolicyConfig {
  /** Learning rate for weight updates (default: 0.01) */
  readonly learningRate?: number;
  /** Decay factor for baseline running average (default: 0.99) */
  readonly baselineDecay?: number;
  /** Maximum gradient magnitude for clipping (default: 1.0) */
  readonly gradientClip?: number;
  /** Minimum learning rate floor (default: 0.001) */
  readonly minLearningRate?: number;
  /** Per-update learning rate decay (default: 0.9999) */
  readonly learningRateDecay?: number;
  /** Discount factor for future rewards (default: 0.99) */
  readonly discountFactor?: number;
  /** Minimum updates before using learned policy (default: 10) */
  readonly warmupUpdates?: number;
}

/** Default learnable policy configuration. */
export const DEFAULT_LEARNABLE_CONFIG: Required<LearnablePolicyConfig> = {
  // Base config
  temperature: 1.0,
  deterministic: false,
  repetitionPenalty: 0.3,
  minProbability: 0.01,
  // Learning config
  learningRate: 0.01,
  baselineDecay: 0.99,
  gradientClip: 1.0,
  minLearningRate: 0.001,
  learningRateDecay: 0.9999,
  discountFactor: 0.99,
  warmupUpdates: 10,
};

/**
 * Statistics for learnable policy.
 */
export interface LearnablePolicyStats {
  /** Total number of policy updates */
  readonly updateCount: number;
  /** Current learning rate */
  readonly currentLearningRate: number;
  /** Current baseline value */
  readonly baseline: number;
  /** Average gradient magnitude from last update */
  readonly lastGradientNorm: number;
  /** Total episodes trained on */
  readonly totalEpisodes: number;
  /** Average episode length */
  readonly avgEpisodeLength: number;
  /** Average final reward */
  readonly avgFinalReward: number;
}

// =============================================================================
// Policy Interface
// =============================================================================

/**
 * Policy engine interface for computing agent selection distributions.
 */
export interface IPolicyEngine {
  /**
   * Compute probability distribution over agents given current state.
   */
  computeDistribution(
    state: PuppeteerState,
    availableAgents: readonly string[]
  ): Promise<Result<AgentDistribution, PolicyError>>;

  /**
   * Sample an agent from the computed distribution.
   */
  sampleAgent(distribution: AgentDistribution): string;

  /**
   * Get current policy parameters (for persistence).
   */
  getParameters(): PolicyParameters;

  /**
   * Load policy parameters (for warm start).
   */
  loadParameters(params: PolicyParameters): void;
}

/**
 * Extended policy interface for learnable policies.
 * (Source: Issue #154, arXiv:2505.19591)
 */
export interface ILearnablePolicyEngine extends IPolicyEngine {
  /**
   * Update policy based on observed trajectory and rewards.
   */
  updatePolicy(
    trajectory: readonly PolicyTrajectoryStep[],
    finalReward: number
  ): Promise<Result<void, PolicyError>>;

  /**
   * Get learning statistics for monitoring.
   */
  getStats(): LearnablePolicyStats;

  /**
   * Check if policy has completed warmup phase.
   */
  isWarmedUp(): boolean;
}

// =============================================================================
// Zod Schemas
// =============================================================================

/** Schema for PolicyErrorCode. */
export const PolicyErrorCodeSchema = z.enum([
  'INVALID_STATE',
  'NO_AGENTS',
  'COMPUTATION_FAILED',
  'UPDATE_FAILED',
  'PARAMETERS_INVALID',
]);

/** Schema for PolicyParameters. */
export const PolicyParametersSchema = z.object({
  version: z.string(),
  weights: z.record(z.string(), z.number()),
  biases: z.record(z.string(), z.number()),
  metadata: z.record(z.string(), z.unknown()),
});

/** Schema for RuleBasedPolicyConfig. */
export const RuleBasedPolicyConfigSchema = z.object({
  temperature: z.number().positive().max(10).optional(),
  deterministic: z.boolean().optional(),
  repetitionPenalty: z.number().min(0).max(1).optional(),
  minProbability: z.number().min(0).max(1).optional(),
});

/** Schema for LearnablePolicyConfig. */
export const LearnablePolicyConfigSchema = RuleBasedPolicyConfigSchema.extend({
  learningRate: z.number().positive().max(1).optional(),
  baselineDecay: z.number().min(0).max(1).optional(),
  gradientClip: z.number().positive().optional(),
  minLearningRate: z.number().positive().max(1).optional(),
  learningRateDecay: z.number().min(0).max(1).optional(),
  discountFactor: z.number().min(0).max(1).optional(),
  warmupUpdates: z.number().int().nonnegative().optional(),
});

/** Schema for LearnablePolicyStats. */
export const LearnablePolicyStatsSchema = z.object({
  updateCount: z.number().int().nonnegative(),
  currentLearningRate: z.number().nonnegative(),
  baseline: z.number(),
  lastGradientNorm: z.number().nonnegative(),
  totalEpisodes: z.number().int().nonnegative(),
  avgEpisodeLength: z.number().nonnegative(),
  avgFinalReward: z.number(),
});
