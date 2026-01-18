/**
 * Rule-Based Policy Engine
 *
 * Phase 1 policy implementation using handcrafted rules for agent selection.
 * Provides the foundation for future learned policies.
 *
 * @module agents/orchestration/rule-based-policy
 * (Source: Issue #335, arXiv:2505.19591)
 */

import { ok, err } from '../../core/result.js';
import type { Result } from '../../core/result.js';
import type { PuppeteerState, AgentDistribution, AgentStepOutput } from './puppeteer-types.js';
import type {
  IPolicyEngine,
  PolicyParameters,
  PolicyError,
  RuleBasedPolicyConfig,
} from './policy-types.js';
import { PolicyError as PolicyErrorClass, DEFAULT_RULE_BASED_CONFIG } from './policy-types.js';

// =============================================================================
// Scoring Features
// =============================================================================

/**
 * Features extracted from state for scoring.
 */
interface ScoringFeatures {
  /** Number of steps taken */
  stepCount: number;
  /** IDs of recently selected agents */
  recentAgents: string[];
  /** Current estimated progress */
  progress: number;
  /** Whether task appears to be stuck */
  isStuck: boolean;
  /** Keywords from task description */
  taskKeywords: string[];
  /** Last agent's reasoning pattern (if any) */
  lastPattern?: string;
}

// =============================================================================
// Agent Scores
// =============================================================================

/**
 * Scores for a single agent.
 */
interface AgentScores {
  /** Base capability score */
  capability: number;
  /** Recency penalty (negative if recently used) */
  recency: number;
  /** Task pattern match score */
  patternMatch: number;
  /** Cost efficiency score */
  costEfficiency: number;
  /** Progress-based adjustment */
  progressAdjust: number;
  /** Total combined score */
  total: number;
}

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
      const features = this.extractFeatures(state);
      const scores = this.computeScores(availableAgents, features, state);
      const distribution = this.scoresToDistribution(scores, availableAgents);
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
    if (this.config.deterministic) {
      return this.argmax(distribution);
    }
    return this.weightedSample(distribution);
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
  // Private: Feature Extraction
  // ===========================================================================

  private extractFeatures(state: PuppeteerState): ScoringFeatures {
    const recentWindow = 3;
    const recentOutputs = state.agentOutputs.slice(-recentWindow);
    const recentAgents = recentOutputs.map((o) => o.agentId);
    const lastPattern = this.inferLastPattern(recentOutputs);

    const features: ScoringFeatures = {
      stepCount: state.step,
      recentAgents,
      progress: state.metadata.progress,
      isStuck: this.detectStuckState(recentOutputs),
      taskKeywords: this.extractKeywords(state.task.description),
    };

    if (lastPattern !== undefined) {
      return { ...features, lastPattern };
    }

    return features;
  }

  private detectStuckState(recentOutputs: readonly AgentStepOutput[]): boolean {
    if (recentOutputs.length < 2) return false;

    // Check if recent outputs are very similar (potential loop)
    const outputStrings = recentOutputs.map((o) =>
      typeof o.output === 'string' ? o.output : JSON.stringify(o.output)
    );

    const similarity = this.computeSimilarity(outputStrings);
    return similarity > 0.9;
  }

  private computeSimilarity(strings: string[]): number {
    if (strings.length < 2) return 0;

    // Simple Jaccard-like similarity based on word overlap
    const wordSets = strings.map((s) => new Set(s.toLowerCase().split(/\s+/)));
    const lastSet = wordSets[wordSets.length - 1];
    const prevSet = wordSets[wordSets.length - 2];

    if (lastSet === undefined || prevSet === undefined) return 0;
    if (lastSet.size === 0 || prevSet.size === 0) return 0;

    let intersection = 0;
    for (const word of lastSet) {
      if (prevSet.has(word)) intersection++;
    }

    const union = lastSet.size + prevSet.size - intersection;
    return union > 0 ? intersection / union : 0;
  }

  private extractKeywords(description: string): string[] {
    const stopWords = new Set([
      'the',
      'a',
      'an',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'being',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'must',
      'shall',
      'to',
      'of',
      'in',
      'for',
      'on',
      'with',
      'at',
      'by',
      'from',
      'this',
      'that',
      'these',
      'those',
      'it',
      'its',
      'and',
      'or',
    ]);

    return description
      .toLowerCase()
      .split(/\W+/)
      .filter((word) => word.length > 2 && !stopWords.has(word))
      .slice(0, 10);
  }

  private inferLastPattern(recentOutputs: readonly AgentStepOutput[]): string | undefined {
    if (recentOutputs.length === 0) return undefined;

    const lastOutput = recentOutputs[recentOutputs.length - 1];
    if (lastOutput === undefined) return undefined;
    const lastAgentId = lastOutput.agentId;
    // Extract pattern from agent ID (e.g., "puppet-decomposer" -> "decomposition")
    const patternMap: Record<string, string> = {
      decomposer: 'decomposition',
      reflector: 'reflection',
      refiner: 'refinement',
      critic: 'critique',
      executor: 'execution',
      terminator: 'termination',
    };

    for (const [key, pattern] of Object.entries(patternMap)) {
      if (lastAgentId.includes(key)) return pattern;
    }
    return undefined;
  }

  // ===========================================================================
  // Private: Scoring
  // ===========================================================================

  private computeScores(
    agents: readonly string[],
    features: ScoringFeatures,
    state: PuppeteerState
  ): Map<string, AgentScores> {
    const scores = new Map<string, AgentScores>();

    for (const agentId of agents) {
      scores.set(agentId, this.computeAgentScore(agentId, features, state));
    }

    return scores;
  }

  private computeAgentScore(
    agentId: string,
    features: ScoringFeatures,
    _state: PuppeteerState
  ): AgentScores {
    const weights = this.parameters.weights;
    const bias = this.parameters.biases[agentId] ?? 0;

    // Capability score based on agent type
    const capability = this.computeCapabilityScore(agentId, features);

    // Recency penalty
    const recency = this.computeRecencyScore(agentId, features);

    // Pattern match score
    const patternMatch = this.computePatternMatchScore(agentId, features);

    // Cost efficiency
    const costEfficiency = this.computeCostEfficiencyScore(agentId);

    // Progress-based adjustment
    const progressAdjust = this.computeProgressAdjustment(agentId, features);

    // Combine scores with weights
    const total =
      (weights['capability_match'] ?? 0.4) * capability +
      (weights['recency'] ?? 0.3) * recency +
      (weights['pattern_match'] ?? 0.1) * patternMatch +
      (weights['cost_efficiency'] ?? 0.2) * costEfficiency +
      progressAdjust +
      bias;

    return { capability, recency, patternMatch, costEfficiency, progressAdjust, total };
  }

  private computeCapabilityScore(agentId: string, features: ScoringFeatures): number {
    // Match agent capabilities to task keywords
    const agentCapabilities: Record<string, string[]> = {
      'puppet-decomposer': ['complex', 'break', 'analyze', 'plan', 'multi', 'step'],
      'puppet-reflector': ['review', 'evaluate', 'assess', 'check', 'improve'],
      'puppet-refiner': ['refine', 'improve', 'enhance', 'optimize', 'polish'],
      'puppet-critic': ['critique', 'feedback', 'verify', 'validate', 'test'],
      'puppet-executor': ['execute', 'run', 'implement', 'build', 'create', 'code'],
      'puppet-terminator': ['complete', 'done', 'finish', 'final', 'verify'],
    };

    const capabilities = agentCapabilities[agentId] ?? [];
    let matches = 0;
    for (const keyword of features.taskKeywords) {
      if (capabilities.some((cap) => keyword.includes(cap) || cap.includes(keyword))) {
        matches++;
      }
    }

    return matches > 0 ? Math.min(matches / 3, 1) : 0.5;
  }

  private computeRecencyScore(agentId: string, features: ScoringFeatures): number {
    const recentIndex = features.recentAgents.lastIndexOf(agentId);
    if (recentIndex === -1) return 1.0; // Not recently used, high score

    // Penalty based on how recently used
    const recencyFactor =
      (features.recentAgents.length - recentIndex) / features.recentAgents.length;
    return recencyFactor * (1 - this.config.repetitionPenalty);
  }

  private computePatternMatchScore(agentId: string, features: ScoringFeatures): number {
    if (features.lastPattern === undefined || features.lastPattern === '') {
      // First step: prefer decomposer
      return agentId.includes('decomposer') ? 1.0 : 0.5;
    }

    // Define pattern transitions
    const transitions: Record<string, string[]> = {
      decomposition: ['executor', 'reflector'],
      reflection: ['refiner', 'executor'],
      refinement: ['critic', 'terminator'],
      critique: ['refiner', 'executor'],
      execution: ['critic', 'reflector', 'terminator'],
      termination: [], // Terminal state
    };

    const preferred = transitions[features.lastPattern] ?? [];
    for (const pref of preferred) {
      if (agentId.includes(pref)) return 1.0;
    }
    return 0.3;
  }

  private computeCostEfficiencyScore(agentId: string): number {
    // Lower cost agents get higher efficiency scores
    const costs: Record<string, number> = {
      'puppet-decomposer': 0.3,
      'puppet-reflector': 0.2,
      'puppet-refiner': 0.4,
      'puppet-critic': 0.25,
      'puppet-executor': 0.5,
      'puppet-terminator': 0.1,
    };

    const cost = costs[agentId] ?? 0.5;
    return 1 - cost;
  }

  private computeProgressAdjustment(agentId: string, features: ScoringFeatures): number {
    // Adjust based on progress
    if (features.progress > 0.8) {
      // Near completion: favor terminator and critic
      if (agentId.includes('terminator')) return 0.5;
      if (agentId.includes('critic')) return 0.3;
      return -0.1;
    }

    if (features.progress < 0.2) {
      // Early stage: favor decomposer
      if (agentId.includes('decomposer')) return 0.3;
      return 0;
    }

    if (features.isStuck) {
      // Stuck: favor reflector to break out
      if (agentId.includes('reflector')) return 0.5;
      return -0.2;
    }

    return 0;
  }

  // ===========================================================================
  // Private: Distribution
  // ===========================================================================

  private scoresToDistribution(
    scores: Map<string, AgentScores>,
    agents: readonly string[]
  ): AgentDistribution {
    const rawScores = new Map<string, number>();
    for (const [agentId, agentScores] of scores) {
      rawScores.set(agentId, agentScores.total);
    }

    // Apply softmax with temperature
    const probabilities = this.softmax(rawScores, this.config.temperature);

    // Ensure minimum probability
    this.enforceMinProbability(probabilities, agents);

    // Generate reasoning
    const reasoning = this.generateReasoning(scores, agents);

    return { probabilities, rawScores, reasoning };
  }

  private softmax(scores: Map<string, number>, temperature: number): Map<string, number> {
    const scaledScores = new Map<string, number>();
    let maxScore = -Infinity;

    for (const score of scores.values()) {
      if (score > maxScore) maxScore = score;
    }

    let sumExp = 0;
    for (const [agentId, score] of scores) {
      const scaled = Math.exp((score - maxScore) / temperature);
      scaledScores.set(agentId, scaled);
      sumExp += scaled;
    }

    const probabilities = new Map<string, number>();
    for (const [agentId, scaled] of scaledScores) {
      probabilities.set(agentId, scaled / sumExp);
    }

    return probabilities;
  }

  private enforceMinProbability(probs: Map<string, number>, agents: readonly string[]): void {
    const minProb = this.config.minProbability;
    const agentCount = agents.length;
    const maxMinTotal = minProb * agentCount;

    if (maxMinTotal >= 1) return; // Cannot enforce minimum

    let deficit = 0;
    let surplus = 0;

    for (const agentId of agents) {
      const prob = probs.get(agentId) ?? 0;
      if (prob < minProb) {
        deficit += minProb - prob;
        probs.set(agentId, minProb);
      } else {
        surplus += prob - minProb;
      }
    }

    // Redistribute deficit from surplus
    if (deficit > 0 && surplus > 0) {
      for (const agentId of agents) {
        const prob = probs.get(agentId) ?? 0;
        if (prob > minProb) {
          const reduction = ((prob - minProb) / surplus) * deficit;
          probs.set(agentId, prob - reduction);
        }
      }
    }
  }

  private generateReasoning(scores: Map<string, AgentScores>, agents: readonly string[]): string {
    const sorted = [...agents].sort((a, b) => {
      return (scores.get(b)?.total ?? 0) - (scores.get(a)?.total ?? 0);
    });

    const top = sorted[0];
    if (top === undefined) return 'No agents available.';
    const topScores = scores.get(top);
    if (!topScores) return 'No scores computed.';

    const parts: string[] = [`Top choice: ${top}`];

    if (topScores.capability > 0.7) {
      parts.push('Good capability match for task');
    }
    if (topScores.recency > 0.8) {
      parts.push('Not recently used');
    }
    if (topScores.patternMatch > 0.7) {
      parts.push('Follows expected pattern');
    }
    if (topScores.progressAdjust > 0.2) {
      parts.push('Appropriate for current progress');
    }

    return parts.join('. ');
  }

  // ===========================================================================
  // Private: Sampling
  // ===========================================================================

  private argmax(distribution: AgentDistribution): string {
    let maxProb = -1;
    let maxAgent = '';

    for (const [agentId, prob] of distribution.probabilities) {
      if (prob > maxProb) {
        maxProb = prob;
        maxAgent = agentId;
      }
    }

    return maxAgent;
  }

  private weightedSample(distribution: AgentDistribution): string {
    const random = Math.random();
    let cumulative = 0;

    for (const [agentId, prob] of distribution.probabilities) {
      cumulative += prob;
      if (random <= cumulative) {
        return agentId;
      }
    }

    // Fallback to last agent (should not happen with valid probabilities)
    const entries = [...distribution.probabilities.entries()];
    return entries[entries.length - 1]?.[0] ?? '';
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
        created: new Date().toISOString(),
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
