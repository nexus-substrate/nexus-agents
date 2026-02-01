/**
 * Rule-Based Policy Engine
 *
 * Phase 1 policy implementation using handcrafted rules for agent selection.
 * Provides the foundation for future learned policies.
 *
 * @module agents/orchestration/rule-based-policy
 * (Source: Issue #335, Issue #352, arXiv:2505.19591)
 */

import { ok, err } from '../../core/result.js';
import { getTimeProvider } from '../../core/index.js';
import type { Result } from '../../core/result.js';
import type { PuppeteerState, AgentDistribution } from './puppeteer-types.js';
import type {
  IPolicyEngine,
  PolicyParameters,
  PolicyError,
  RuleBasedPolicyConfig,
} from './policy-types.js';
import { PolicyError as PolicyErrorClass, DEFAULT_RULE_BASED_CONFIG } from './policy-types.js';

// Import extracted modules
import { extractFeatures } from './policy-feature-extraction.js';
import type { ScoringFeatures } from './policy-feature-extraction.js';
import { computeAllAgentScores } from './policy-scoring.js';
import type { AgentScores } from './policy-scoring.js';
import { scoresToDistribution, sampleFromDistribution } from './policy-distribution.js';

// =============================================================================
// Re-exports for backward compatibility
// =============================================================================

export type { ScoringFeatures } from './policy-feature-extraction.js';
export type { AgentScores } from './policy-scoring.js';

// =============================================================================
// Rule-Based Policy Implementation
// =============================================================================

/**
 * Rule-based policy engine for agent selection.
 */
export class RuleBasedPolicy implements IPolicyEngine {
  private readonly config: Required<RuleBasedPolicyConfig>;
  private parameters: PolicyParameters;

  constructor(config: RuleBasedPolicyConfig = {}) {
    this.config = { ...DEFAULT_RULE_BASED_CONFIG, ...config };
    this.parameters = this.createDefaultParameters();
  }

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
    return { ...this.parameters };
  }

  /**
   * Load policy parameters.
   */
  loadParameters(params: PolicyParameters): void {
    this.parameters = { ...params };
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
      version: '1.0.0',
      weights: {
        recency: 0.3,
        capability_match: 0.4,
        cost_efficiency: 0.2,
        pattern_match: 0.1,
      },
      biases: {},
      metadata: {
        created: getTimeProvider().nowIso(),
        trainedOnTasks: 0,
      },
    };
  }
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a rule-based policy engine.
 */
export function createRuleBasedPolicy(config?: RuleBasedPolicyConfig): IPolicyEngine {
  return new RuleBasedPolicy(config);
}
