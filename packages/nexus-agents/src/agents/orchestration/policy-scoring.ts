/**
 * Policy Scoring Functions
 *
 * Scoring computations for rule-based agent selection policy.
 * Computes capability, recency, pattern match, cost efficiency,
 * and progress-based scores for each agent.
 *
 * @module agents/orchestration/policy-scoring
 * (Source: Issue #335, Issue #352, arXiv:2505.19591)
 */

import type { ScoringFeatures } from './policy-feature-extraction.js';

// =============================================================================
// Agent Scores
// =============================================================================

/**
 * Scores for a single agent.
 */
export interface AgentScores {
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
// Agent Capabilities Map
// =============================================================================

/** Keywords that match agent capabilities. */
const AGENT_CAPABILITIES: Readonly<Record<string, readonly string[]>> = {
  'puppet-decomposer': ['complex', 'break', 'analyze', 'plan', 'multi', 'step'],
  'puppet-reflector': ['review', 'evaluate', 'assess', 'check', 'improve'],
  'puppet-refiner': ['refine', 'improve', 'enhance', 'optimize', 'polish'],
  'puppet-critic': ['critique', 'feedback', 'verify', 'validate', 'test'],
  'puppet-executor': ['execute', 'run', 'implement', 'build', 'create', 'code'],
  'puppet-terminator': ['complete', 'done', 'finish', 'final', 'verify'],
};

/** Relative cost per agent invocation (0-1). */
const AGENT_COSTS: Readonly<Record<string, number>> = {
  'puppet-decomposer': 0.3,
  'puppet-reflector': 0.2,
  'puppet-refiner': 0.4,
  'puppet-critic': 0.25,
  'puppet-executor': 0.5,
  'puppet-terminator': 0.1,
};

/** Pattern transition graph for reasoning flow. */
const PATTERN_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  decomposition: ['executor', 'reflector'],
  reflection: ['refiner', 'executor'],
  refinement: ['critic', 'terminator'],
  critique: ['refiner', 'executor'],
  execution: ['critic', 'reflector', 'terminator'],
  termination: [], // Terminal state
};

// =============================================================================
// Scoring Functions
// =============================================================================

/**
 * Compute capability score based on task keyword matches.
 */
export function computeCapabilityScore(agentId: string, features: ScoringFeatures): number {
  const capabilities = AGENT_CAPABILITIES[agentId] ?? [];
  let matches = 0;

  for (const keyword of features.taskKeywords) {
    if (capabilities.some((cap) => keyword.includes(cap) || cap.includes(keyword))) {
      matches++;
    }
  }

  return matches > 0 ? Math.min(matches / 3, 1) : 0.5;
}

/**
 * Compute recency score (penalty for recently used agents).
 */
export function computeRecencyScore(
  agentId: string,
  features: ScoringFeatures,
  repetitionPenalty: number
): number {
  const recentIndex = features.recentAgents.lastIndexOf(agentId);
  if (recentIndex === -1) return 1.0; // Not recently used, high score

  // Penalty based on how recently used
  const recencyFactor = (features.recentAgents.length - recentIndex) / features.recentAgents.length;
  return recencyFactor * (1 - repetitionPenalty);
}

/**
 * Compute pattern match score based on reasoning flow.
 */
export function computePatternMatchScore(agentId: string, features: ScoringFeatures): number {
  if (features.lastPattern === undefined || features.lastPattern === '') {
    // First step: prefer decomposer
    return agentId.includes('decomposer') ? 1.0 : 0.5;
  }

  const preferred = PATTERN_TRANSITIONS[features.lastPattern] ?? [];
  for (const pref of preferred) {
    if (agentId.includes(pref)) return 1.0;
  }
  return 0.3;
}

/**
 * Compute cost efficiency score (lower cost = higher score).
 */
export function computeCostEfficiencyScore(agentId: string): number {
  const cost = AGENT_COSTS[agentId] ?? 0.5;
  return 1 - cost;
}

/**
 * Compute progress-based adjustment score.
 */
export function computeProgressAdjustment(agentId: string, features: ScoringFeatures): number {
  // Near completion: favor terminator and critic
  if (features.progress > 0.8) {
    if (agentId.includes('terminator')) return 0.5;
    if (agentId.includes('critic')) return 0.3;
    return -0.1;
  }

  // Early stage: favor decomposer
  if (features.progress < 0.2) {
    if (agentId.includes('decomposer')) return 0.3;
    return 0;
  }

  // Stuck: favor reflector to break out
  if (features.isStuck) {
    if (agentId.includes('reflector')) return 0.5;
    return -0.2;
  }

  return 0;
}

/**
 * Compute combined score for an agent.
 */
export function computeAgentScore(
  agentId: string,
  features: ScoringFeatures,
  weights: Readonly<Record<string, number>>,
  bias: number,
  repetitionPenalty: number
): AgentScores {
  const capability = computeCapabilityScore(agentId, features);
  const recency = computeRecencyScore(agentId, features, repetitionPenalty);
  const patternMatch = computePatternMatchScore(agentId, features);
  const costEfficiency = computeCostEfficiencyScore(agentId);
  const progressAdjust = computeProgressAdjustment(agentId, features);

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

/**
 * Compute scores for all agents.
 */
export function computeAllAgentScores(
  agents: readonly string[],
  features: ScoringFeatures,
  weights: Readonly<Record<string, number>>,
  biases: Readonly<Record<string, number>>,
  repetitionPenalty: number
): Map<string, AgentScores> {
  const scores = new Map<string, AgentScores>();

  for (const agentId of agents) {
    const bias = biases[agentId] ?? 0;
    scores.set(agentId, computeAgentScore(agentId, features, weights, bias, repetitionPenalty));
  }

  return scores;
}
